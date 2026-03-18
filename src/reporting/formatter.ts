import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AggregatedReport } from "./types.js";
import type { OutputFormat } from "../types.js";

export function writeReport(
  report: AggregatedReport,
  outputDir: string,
  formats: OutputFormat[]
): void {
  mkdirSync(outputDir, { recursive: true });

  for (const format of formats) {
    switch (format) {
      case "json":
        writeFileSync(
          join(outputDir, "report.json"),
          JSON.stringify(report, null, 2)
        );
        break;
      case "markdown":
        writeFileSync(join(outputDir, "report.md"), formatMarkdown(report));
        break;
      case "html":
        writeFileSync(join(outputDir, "report.html"), formatHtml(report));
        break;
    }
  }
}

function formatMarkdown(report: AggregatedReport): string {
  const lines: string[] = [];
  const { summary, taskAnalysis, performanceAnalysis, frustrationAnalysis, navigationAnalysis, issuesList, personaSummaries, recommendations } = report;

  lines.push(`# UX Test Report`);
  lines.push("");
  lines.push(`**URL:** ${summary.url}`);
  lines.push(`**Date:** ${summary.testDate}`);
  lines.push(`**Personas:** ${summary.personaCount}`);
  lines.push(`**Duration:** ${(summary.totalDurationMs / 1000).toFixed(1)}s`);
  lines.push("");

  // Issues
  if (issuesList.length > 0) {
    lines.push("## Issues Found");
    lines.push("");
    lines.push("| Severity | Category | Description | Affected Personas | URL |");
    lines.push("|----------|----------|-------------|-------------------|-----|");
    for (const issue of issuesList) {
      lines.push(
        `| **${issue.severity.toUpperCase()}** | ${issue.category} | ${issue.description} | ${issue.affectedPersonas.join(", ")} | ${truncateUrl(issue.url)} |`
      );
    }
    lines.push("");
  }

  // Recommendations
  if (recommendations.length > 0) {
    lines.push("## Recommendations");
    lines.push("");
    for (const rec of recommendations) {
      lines.push(`- ${rec}`);
    }
    lines.push("");
  }

  // Task Analysis
  if (taskAnalysis.length > 0) {
    lines.push("## Task Analysis");
    lines.push("");
    lines.push("| Task | Completion Rate | Avg Time | Median Time | Avg Steps |");
    lines.push("|------|----------------|----------|-------------|-----------|");
    for (const task of taskAnalysis) {
      lines.push(
        `| ${task.taskId} | ${Math.round(task.completionRate * 100)}% | ${(task.avgTimeMs / 1000).toFixed(1)}s | ${(task.medianTimeMs / 1000).toFixed(1)}s | ${task.avgSteps.toFixed(1)} |`
      );
    }
    lines.push("");

    for (const task of taskAnalysis) {
      lines.push(`### ${task.taskId}: ${task.taskDescription}`);
      lines.push("");
      for (const p of task.personaBreakdown) {
        const status = p.completed ? "PASS" : "FAIL";
        lines.push(
          `- **${p.personaId}**: ${status} (${(p.timeMs / 1000).toFixed(1)}s, ${p.steps} steps)${p.errors.length > 0 ? ` — Errors: ${p.errors.join("; ")}` : ""}`
        );
      }
      lines.push("");
    }
  }

  // Performance
  lines.push("## Performance Analysis");
  lines.push("");
  lines.push(`- **Web Vitals:** ${performanceAnalysis.webVitalsPass ? "PASS" : "FAIL"}`);
  if (performanceAnalysis.avgLCP != null) lines.push(`- **Avg LCP:** ${Math.round(performanceAnalysis.avgLCP)}ms`);
  if (performanceAnalysis.avgCLS != null) lines.push(`- **Avg CLS:** ${performanceAnalysis.avgCLS.toFixed(3)}`);
  if (performanceAnalysis.avgTBT != null) lines.push(`- **Avg TBT:** ${Math.round(performanceAnalysis.avgTBT)}ms`);
  if (performanceAnalysis.avgPageLoadMs != null) lines.push(`- **Avg Page Load:** ${Math.round(performanceAnalysis.avgPageLoadMs)}ms`);
  lines.push("");

  if (performanceAnalysis.slowestPages.length > 0) {
    lines.push("### Slowest Pages");
    lines.push("");
    for (const page of performanceAnalysis.slowestPages.slice(0, 5)) {
      lines.push(`- ${truncateUrl(page.url)}: ${Math.round(page.pageLoadMs)}ms`);
    }
    lines.push("");
  }

  // Frustration
  if (frustrationAnalysis.totalSignals > 0) {
    lines.push("## Frustration Analysis");
    lines.push("");
    lines.push(`**Total signals:** ${frustrationAnalysis.totalSignals}`);
    lines.push("");

    if (Object.keys(frustrationAnalysis.byType).length > 0) {
      lines.push("**By type:**");
      for (const [type, count] of Object.entries(frustrationAnalysis.byType)) {
        lines.push(`- ${type}: ${count}`);
      }
      lines.push("");
    }

    if (frustrationAnalysis.topFrustrationUrls.length > 0) {
      lines.push("**Top frustration URLs:**");
      for (const entry of frustrationAnalysis.topFrustrationUrls.slice(0, 5)) {
        lines.push(`- ${truncateUrl(entry.url)} (${entry.count} signals)`);
      }
      lines.push("");
    }
  }

  // Navigation
  if (navigationAnalysis.mostVisitedPages.length > 0) {
    lines.push("## Navigation Analysis");
    lines.push("");
    lines.push("**Most visited pages:**");
    for (const page of navigationAnalysis.mostVisitedPages.slice(0, 10)) {
      lines.push(`- ${truncateUrl(page.url)}: ${page.visitCount} visits`);
    }
    lines.push("");

    if (navigationAnalysis.deadEndPages.length > 0) {
      lines.push("**Dead-end pages** (users frequently bounce back):");
      for (const url of navigationAnalysis.deadEndPages.slice(0, 5)) {
        lines.push(`- ${truncateUrl(url)}`);
      }
      lines.push("");
    }
  }

  // Persona Summaries
  lines.push("## Persona Summaries");
  lines.push("");
  for (const ps of personaSummaries) {
    lines.push(`### ${ps.personaLabel}`);
    lines.push("");
    lines.push(`- **Task Completion:** ${Math.round(ps.taskCompletionRate * 100)}%`);
    lines.push(`- **Frustration Signals:** ${ps.frustrationCount}`);
    if (ps.avgTaskTimeMs > 0) lines.push(`- **Avg Task Time:** ${(ps.avgTaskTimeMs / 1000).toFixed(1)}s`);
    lines.push("");
    if (ps.agentNarrative) {
      lines.push("<details>");
      lines.push(`<summary>Full narrative</summary>`);
      lines.push("");
      lines.push(ps.agentNarrative);
      lines.push("");
      lines.push("</details>");
      lines.push("");
    }
  }

  lines.push("---");
  lines.push("*Generated by ux-test — Synthetic User Testing powered by Claude AI*");

  return lines.join("\n");
}

function formatHtml(report: AggregatedReport): string {
  const md = formatMarkdown(report);

  // Simple HTML wrapper — no external dependencies
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>UX Test Report — ${escapeHtml(report.summary.url)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a2e; background: #f8f9fa; padding: 2rem; max-width: 960px; margin: 0 auto; }
    h1 { font-size: 1.75rem; margin-bottom: 0.5rem; color: #1a1a2e; }
    h2 { font-size: 1.35rem; margin-top: 2rem; margin-bottom: 0.75rem; padding-bottom: 0.25rem; border-bottom: 2px solid #e9ecef; }
    h3 { font-size: 1.1rem; margin-top: 1.25rem; margin-bottom: 0.5rem; }
    p, li { margin-bottom: 0.5rem; }
    ul { padding-left: 1.5rem; }
    table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 0.9rem; }
    th, td { padding: 0.5rem 0.75rem; border: 1px solid #dee2e6; text-align: left; }
    th { background: #e9ecef; font-weight: 600; }
    tr:nth-child(even) { background: #f8f9fa; }
    .summary { background: #fff; border: 1px solid #dee2e6; border-radius: 8px; padding: 1.25rem; margin-bottom: 1.5rem; }
    .summary p { margin: 0.25rem 0; }
    .severity-critical { color: #dc3545; font-weight: 700; }
    .severity-high { color: #e67700; font-weight: 600; }
    .severity-medium { color: #ffc107; font-weight: 600; }
    .severity-low { color: #28a745; }
    .pass { color: #28a745; font-weight: 600; }
    .fail { color: #dc3545; font-weight: 600; }
    details { margin: 0.5rem 0; }
    summary { cursor: pointer; font-weight: 500; }
    pre { background: #f1f3f5; padding: 1rem; border-radius: 4px; overflow-x: auto; font-size: 0.85rem; }
    hr { margin: 2rem 0; border: none; border-top: 1px solid #dee2e6; }
    footer { text-align: center; color: #868e96; font-size: 0.85rem; margin-top: 2rem; }
  </style>
</head>
<body>
  <h1>UX Test Report</h1>
  <div class="summary">
    <p><strong>URL:</strong> ${escapeHtml(report.summary.url)}</p>
    <p><strong>Date:</strong> ${escapeHtml(report.summary.testDate)}</p>
    <p><strong>Personas:</strong> ${report.summary.personaCount}</p>
    <p><strong>Duration:</strong> ${(report.summary.totalDurationMs / 1000).toFixed(1)}s</p>
    <p><strong>Web Vitals:</strong> <span class="${report.performanceAnalysis.webVitalsPass ? "pass" : "fail"}">${report.performanceAnalysis.webVitalsPass ? "PASS" : "FAIL"}</span></p>
  </div>

  ${report.issuesList.length > 0 ? `
  <h2>Issues Found (${report.issuesList.length})</h2>
  <table>
    <thead><tr><th>Severity</th><th>Category</th><th>Description</th><th>Affected Personas</th></tr></thead>
    <tbody>
      ${report.issuesList.map((issue) => `
        <tr>
          <td class="severity-${issue.severity}">${issue.severity.toUpperCase()}</td>
          <td>${escapeHtml(issue.category)}</td>
          <td>${escapeHtml(issue.description)}</td>
          <td>${escapeHtml(issue.affectedPersonas.join(", "))}</td>
        </tr>
      `).join("")}
    </tbody>
  </table>` : "<p>No issues found.</p>"}

  ${report.recommendations.length > 0 ? `
  <h2>Recommendations</h2>
  <ul>${report.recommendations.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>` : ""}

  ${report.taskAnalysis.length > 0 ? `
  <h2>Task Analysis</h2>
  <table>
    <thead><tr><th>Task</th><th>Completion</th><th>Avg Time</th><th>Median Time</th><th>Avg Steps</th></tr></thead>
    <tbody>
      ${report.taskAnalysis.map((t) => `
        <tr>
          <td>${escapeHtml(t.taskId)}</td>
          <td class="${t.completionRate >= 0.8 ? "pass" : "fail"}">${Math.round(t.completionRate * 100)}%</td>
          <td>${(t.avgTimeMs / 1000).toFixed(1)}s</td>
          <td>${(t.medianTimeMs / 1000).toFixed(1)}s</td>
          <td>${t.avgSteps.toFixed(1)}</td>
        </tr>
      `).join("")}
    </tbody>
  </table>` : ""}

  <h2>Persona Summaries</h2>
  ${report.personaSummaries.map((ps) => `
    <h3>${escapeHtml(ps.personaLabel)}</h3>
    <ul>
      <li><strong>Task Completion:</strong> ${Math.round(ps.taskCompletionRate * 100)}%</li>
      <li><strong>Frustration Signals:</strong> ${ps.frustrationCount}</li>
      ${ps.avgTaskTimeMs > 0 ? `<li><strong>Avg Task Time:</strong> ${(ps.avgTaskTimeMs / 1000).toFixed(1)}s</li>` : ""}
    </ul>
    ${ps.agentNarrative ? `<details><summary>Full narrative</summary><pre>${escapeHtml(ps.agentNarrative)}</pre></details>` : ""}
  `).join("")}

  <hr>
  <footer>Generated by ux-test — Synthetic User Testing powered by Claude AI</footer>
</body>
</html>`;
}

function truncateUrl(url: string, maxLen = 60): string {
  if (url.length <= maxLen) return url;
  return url.slice(0, maxLen - 3) + "...";
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
