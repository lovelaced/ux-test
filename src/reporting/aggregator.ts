import type { PageVisit, PersonaResult, TestConfig, ThresholdConfig } from "../types.js";
import { buildClickHeatmaps, findFirstInteractions } from "../metrics/interaction.js";
import type {
  AggregatedReport,
  TaskAnalysis,
  PerformanceAnalysis,
  FrustrationAnalysis,
  NavigationAnalysis,
  SeverityRankedIssue,
  PersonaSummary,
  FirstInteraction,
  ExecutiveSummary,
  PersonaFlow,
} from "./types.js";

export function aggregateResults(
  results: PersonaResult[],
  config: TestConfig,
  wallClockMs?: number
): AggregatedReport {
  const thresholds = config.thresholds ?? {};

  return {
    summary: buildSummary(results, config, wallClockMs),
    taskAnalysis: buildTaskAnalysis(results, config),
    performanceAnalysis: buildPerformanceAnalysis(results, thresholds),
    frustrationAnalysis: buildFrustrationAnalysis(results),
    navigationAnalysis: buildNavigationAnalysis(results),
    heatmapData: buildHeatmapData(results),
    issuesList: buildIssuesList(results, thresholds),
    personaSummaries: buildPersonaSummaries(results),
    recommendations: buildRecommendations(results, thresholds),
    firstInteractions: buildFirstInteractions(results),
    executiveSummary: buildExecutiveSummary(results, thresholds),
    personaFlows: buildPersonaFlows(results),
  };
}

function buildSummary(results: PersonaResult[], config: TestConfig, wallClockMs?: number) {
  // Use wall-clock time if provided, otherwise use max persona duration (parallel execution)
  const duration = wallClockMs ?? Math.max(...results.map((r) => r.durationMs), 0);
  return {
    url: config.url,
    testDate: new Date().toISOString(),
    personaCount: results.length,
    totalDurationMs: duration,
  };
}

function buildTaskAnalysis(
  results: PersonaResult[],
  config: TestConfig
): TaskAnalysis[] {
  const tasks = config.tasks ?? [];
  if (tasks.length === 0) return [];

  return tasks.map((task) => {
    const personaBreakdown = results.map((r) => {
      const tr = r.tasks.find((t) => t.taskId === task.id);
      return {
        personaId: r.personaId,
        completed: tr?.completed ?? false,
        timeMs: tr?.timeMs ?? 0,
        steps: tr?.stepsCount ?? 0,
        errors: tr?.errorMessages ?? [],
      };
    });

    const completedResults = personaBreakdown.filter((p) => p.completed);
    const times = personaBreakdown.map((p) => p.timeMs).filter((t) => t > 0);
    const sortedTimes = [...times].sort((a, b) => a - b);

    return {
      taskId: task.id,
      taskDescription: task.description,
      completionRate:
        personaBreakdown.length > 0
          ? completedResults.length / personaBreakdown.length
          : 0,
      avgTimeMs:
        times.length > 0
          ? times.reduce((a, b) => a + b, 0) / times.length
          : 0,
      medianTimeMs:
        sortedTimes.length > 0
          ? sortedTimes[Math.floor(sortedTimes.length / 2)]
          : 0,
      avgSteps:
        personaBreakdown.length > 0
          ? personaBreakdown.reduce((sum, p) => sum + p.steps, 0) /
            personaBreakdown.length
          : 0,
      personaBreakdown,
    };
  });
}

function buildPerformanceAnalysis(
  results: PersonaResult[],
  thresholds: ThresholdConfig
): PerformanceAnalysis {
  const allSnapshots = results.flatMap((r) => r.performanceSnapshots);

  const lcpValues = allSnapshots.map((s) => s.lcp).filter((v): v is number => v != null);
  const clsValues = allSnapshots.map((s) => s.cls).filter((v): v is number => v != null);
  const tbtValues = allSnapshots.map((s) => s.tbt).filter((v): v is number => v != null);
  const loadValues = allSnapshots.map((s) => s.pageLoadMs).filter((v): v is number => v != null);

  const avg = (arr: number[]) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

  const avgLCP = avg(lcpValues);
  const avgCLS = avg(clsValues);
  const avgTBT = avg(tbtValues);
  const avgPageLoadMs = avg(loadValues);

  // Slowest pages by load time
  const pageLoads = new Map<string, number[]>();
  for (const snap of allSnapshots) {
    if (snap.pageLoadMs != null) {
      if (!pageLoads.has(snap.url)) pageLoads.set(snap.url, []);
      pageLoads.get(snap.url)!.push(snap.pageLoadMs);
    }
  }

  const slowestPages = Array.from(pageLoads.entries())
    .map(([url, times]) => ({
      url,
      pageLoadMs: Math.max(...times),
    }))
    .sort((a, b) => b.pageLoadMs - a.pageLoadMs)
    .slice(0, 10);

  const webVitalsPass =
    (avgLCP == null || avgLCP <= (thresholds.maxLCP ?? 2500)) &&
    (avgCLS == null || avgCLS <= (thresholds.maxCLS ?? 0.1)) &&
    (avgTBT == null || avgTBT <= (thresholds.maxTBT ?? 200));

  return { avgLCP, avgCLS, avgTBT, avgPageLoadMs, slowestPages, webVitalsPass };
}

function buildFrustrationAnalysis(
  results: PersonaResult[]
): FrustrationAnalysis {
  const allSignals = results.flatMap((r) => r.frustrationSignals);

  const byType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  const byUrl = new Map<string, typeof allSignals>();

  for (const signal of allSignals) {
    byType[signal.type] = (byType[signal.type] ?? 0) + 1;
    bySeverity[signal.severity] = (bySeverity[signal.severity] ?? 0) + 1;
    if (!byUrl.has(signal.url)) byUrl.set(signal.url, []);
    byUrl.get(signal.url)!.push(signal);
  }

  const topFrustrationUrls = Array.from(byUrl.entries())
    .map(([url, signals]) => ({ url, count: signals.length, signals }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalSignals: allSignals.length,
    byType,
    bySeverity,
    topFrustrationUrls,
  };
}

function buildNavigationAnalysis(
  results: PersonaResult[]
): NavigationAnalysis {
  const allVisits = results.flatMap((r) => r.navigationPath);

  // Most visited pages
  const visitCounts = new Map<string, number>();
  for (const visit of allVisits) {
    visitCounts.set(visit.url, (visitCounts.get(visit.url) ?? 0) + 1);
  }

  const mostVisitedPages = Array.from(visitCounts.entries())
    .map(([url, visitCount]) => ({ url, visitCount }))
    .sort((a, b) => b.visitCount - a.visitCount)
    .slice(0, 15);

  // Common navigation paths (sequences of 2-3 URLs shared by multiple personas)
  const pathPairs = new Map<string, number>();
  for (const result of results) {
    const urls = result.navigationPath.map((v) => v.url);
    for (let i = 0; i < urls.length - 1; i++) {
      const pair = `${urls[i]} -> ${urls[i + 1]}`;
      pathPairs.set(pair, (pathPairs.get(pair) ?? 0) + 1);
    }
  }

  const commonPaths = Array.from(pathPairs.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([path]) => path.split(" -> "));

  // Dead-end pages: pages where users often hit the back button or leave
  const deadEndPages: string[] = [];
  for (const result of results) {
    const urls = result.navigationPath.map((v) => v.url);
    for (let i = 1; i < urls.length - 1; i++) {
      // If the user visited A -> B -> A, B might be a dead end
      if (urls[i - 1] === urls[i + 1] && urls[i] !== urls[i - 1]) {
        deadEndPages.push(urls[i]);
      }
    }
  }

  const deadEndCounts = new Map<string, number>();
  for (const url of deadEndPages) {
    deadEndCounts.set(url, (deadEndCounts.get(url) ?? 0) + 1);
  }

  const uniqueDeadEnds = Array.from(deadEndCounts.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([url]) => url);

  // Page engagement: avg scroll depth and dwell time per URL
  const engagementByUrl = new Map<string, { scrollSum: number; dwellSum: number; count: number }>();
  for (const visit of allVisits) {
    if (!engagementByUrl.has(visit.url)) {
      engagementByUrl.set(visit.url, { scrollSum: 0, dwellSum: 0, count: 0 });
    }
    const e = engagementByUrl.get(visit.url)!;
    e.scrollSum += visit.scrollDepthPercent;
    e.dwellSum += visit.dwellTimeMs;
    e.count++;
  }

  const pageEngagement = Array.from(engagementByUrl.entries())
    .map(([url, e]) => ({
      url,
      avgScrollDepthPercent: Math.round(e.scrollSum / e.count),
      avgDwellTimeMs: Math.round(e.dwellSum / e.count),
      visitCount: e.count,
    }))
    .sort((a, b) => b.avgDwellTimeMs - a.avgDwellTimeMs)
    .slice(0, 15);

  return { mostVisitedPages, commonPaths, deadEndPages: uniqueDeadEnds, pageEngagement };
}

function buildHeatmapData(results: PersonaResult[]) {
  const allInteractions = results.flatMap((r) => r.interactions);
  return buildClickHeatmaps(allInteractions);
}

function buildIssuesList(
  results: PersonaResult[],
  thresholds: ThresholdConfig
): SeverityRankedIssue[] {
  const issues: SeverityRankedIssue[] = [];

  // Performance issues
  const allSnapshots = results.flatMap((r) => r.performanceSnapshots);
  const pagePerf = new Map<string, { lcp: number[]; cls: number[]; load: number[] }>();

  for (const snap of allSnapshots) {
    if (!pagePerf.has(snap.url)) pagePerf.set(snap.url, { lcp: [], cls: [], load: [] });
    const entry = pagePerf.get(snap.url)!;
    if (snap.lcp != null) entry.lcp.push(snap.lcp);
    if (snap.cls != null) entry.cls.push(snap.cls);
    if (snap.pageLoadMs != null) entry.load.push(snap.pageLoadMs);
  }

  for (const [url, perf] of pagePerf) {
    const avgLcp = perf.lcp.length > 0 ? perf.lcp.reduce((a, b) => a + b, 0) / perf.lcp.length : null;
    const avgCls = perf.cls.length > 0 ? perf.cls.reduce((a, b) => a + b, 0) / perf.cls.length : null;

    if (avgLcp != null && avgLcp > (thresholds.maxLCP ?? 2500)) {
      issues.push({
        severity: avgLcp > 4000 ? "critical" : "high",
        category: "performance",
        description: `Slow Largest Contentful Paint (${Math.round(avgLcp)}ms)`,
        affectedPersonas: results.filter((r) => r.performanceSnapshots.some((s) => s.url === url)).map((r) => r.personaId),
        url,
        evidence: `Average LCP: ${Math.round(avgLcp)}ms (threshold: ${thresholds.maxLCP ?? 2500}ms)`,
      });
    }

    if (avgCls != null && avgCls > (thresholds.maxCLS ?? 0.1)) {
      issues.push({
        severity: avgCls > 0.25 ? "high" : "medium",
        category: "performance",
        description: `High Cumulative Layout Shift (${avgCls.toFixed(3)})`,
        affectedPersonas: results.filter((r) => r.performanceSnapshots.some((s) => s.url === url)).map((r) => r.personaId),
        url,
        evidence: `Average CLS: ${avgCls.toFixed(3)} (threshold: ${thresholds.maxCLS ?? 0.1})`,
      });
    }
  }

  // Frustration-based issues
  const frustrationByUrl = new Map<string, { signals: typeof results[0]["frustrationSignals"]; personas: Set<string> }>();
  for (const result of results) {
    for (const signal of result.frustrationSignals) {
      if (!frustrationByUrl.has(signal.url)) {
        frustrationByUrl.set(signal.url, { signals: [], personas: new Set() });
      }
      const entry = frustrationByUrl.get(signal.url)!;
      entry.signals.push(signal);
      entry.personas.add(result.personaId);
    }
  }

  for (const [url, { signals, personas }] of frustrationByUrl) {
    const highSeverity = signals.filter((s) => s.severity === "high");
    if (highSeverity.length > 0) {
      issues.push({
        severity: personas.size >= 3 ? "critical" : personas.size >= 2 ? "high" : "medium",
        category: "usability",
        description: `High frustration detected: ${highSeverity.map((s) => s.description).join("; ")}`,
        affectedPersonas: Array.from(personas),
        url,
        evidence: `${highSeverity.length} high-severity frustration signal(s) from ${personas.size} persona(s)`,
      });
    }
  }

  // Task completion issues
  if (results.length > 0 && results[0].tasks.length > 0) {
    const taskIds = new Set(results.flatMap((r) => r.tasks.map((t) => t.taskId)));
    for (const taskId of taskIds) {
      const taskResults = results.map((r) => r.tasks.find((t) => t.taskId === taskId)).filter(Boolean);
      const completionRate = taskResults.filter((t) => t!.completed).length / Math.max(taskResults.length, 1);

      if (completionRate < (thresholds.minTaskCompletionRate ?? 0.8)) {
        const failedPersonas = results.filter((r) => {
          const t = r.tasks.find((t) => t.taskId === taskId);
          return t && !t.completed;
        });

        issues.push({
          severity: completionRate === 0 ? "critical" : completionRate < 0.5 ? "high" : "medium",
          category: "functionality",
          description: `Low task completion rate for "${taskId}" (${Math.round(completionRate * 100)}%)`,
          affectedPersonas: failedPersonas.map((r) => r.personaId),
          url: results[0].navigationPath[0]?.url ?? "",
          evidence: `${taskResults.filter((t) => t!.completed).length}/${taskResults.length} personas completed the task`,
        });
      }
    }
  }

  // Accessibility issues from keyboard-only persona
  const keyboardResult = results.find((r) => r.personaId === "keyboard-only");
  if (keyboardResult) {
    const accessibilitySignals = keyboardResult.frustrationSignals.filter(
      (s) => s.description.toLowerCase().includes("focus") ||
             s.description.toLowerCase().includes("keyboard") ||
             s.description.toLowerCase().includes("tab") ||
             s.description.toLowerCase().includes("aria")
    );

    for (const signal of accessibilitySignals) {
      issues.push({
        severity: "high",
        category: "accessibility",
        description: signal.description,
        affectedPersonas: ["keyboard-only"],
        url: signal.url,
        evidence: `Keyboard-only user reported: ${signal.description}`,
      });
    }
  }

  // Design issues from UI/UX design personas
  const DESIGN_PERSONA_IDS = new Set([
    "visual-design-critic",
    "interface-design-evaluator",
    "design-consistency-auditor",
    "motion-animation-evaluator",
    "typography-color-critic",
  ]);

  const designResults = results.filter((r) => DESIGN_PERSONA_IDS.has(r.personaId));
  for (const result of designResults) {
    for (const signal of result.frustrationSignals) {
      // Avoid duplicating signals already captured by the general frustration analysis
      const isDuplicate = issues.some(
        (i) => i.url === signal.url && i.description === signal.description
      );
      if (!isDuplicate) {
        issues.push({
          severity: signal.severity === "high" ? "high" : "medium",
          category: "design",
          description: signal.description,
          affectedPersonas: [result.personaId],
          url: signal.url,
          evidence: `${result.personaId} reported: ${signal.description}`,
        });
      }
    }
  }

  // Sort by severity
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return issues;
}

function buildPersonaSummaries(results: PersonaResult[]): PersonaSummary[] {
  return results.map((r) => {
    const completedTasks = r.tasks.filter((t) => t.completed).length;
    const totalTasks = r.tasks.length;
    const taskTimes = r.tasks.map((t) => t.timeMs).filter((t) => t > 0);

    return {
      personaId: r.personaId,
      personaLabel: r.personaLabel,
      agentNarrative: r.agentTranscriptSummary,
      taskCompletionRate: totalTasks > 0 ? completedTasks / totalTasks : 0,
      frustrationCount: r.frustrationSignals.length,
      avgTaskTimeMs:
        taskTimes.length > 0
          ? taskTimes.reduce((a, b) => a + b, 0) / taskTimes.length
          : 0,
      durationMs: r.durationMs,
    };
  });
}

function buildRecommendations(
  results: PersonaResult[],
  thresholds: ThresholdConfig
): string[] {
  const recs: string[] = [];
  const allSnapshots = results.flatMap((r) => r.performanceSnapshots);
  const allSignals = results.flatMap((r) => r.frustrationSignals);

  // Performance recommendations
  const lcpValues = allSnapshots.map((s) => s.lcp).filter((v): v is number => v != null);
  const avgLcp = lcpValues.length > 0 ? lcpValues.reduce((a, b) => a + b, 0) / lcpValues.length : null;
  if (avgLcp != null && avgLcp > (thresholds.maxLCP ?? 2500)) {
    recs.push(
      `Optimize Largest Contentful Paint (currently ${Math.round(avgLcp)}ms). Consider lazy-loading images, preloading critical resources, and optimizing server response times.`
    );
  }

  // Frustration recommendations
  const rageClicks = allSignals.filter((s) => s.type === "rage_click");
  if (rageClicks.length > 0) {
    const urls = [...new Set(rageClicks.map((s) => s.url))];
    recs.push(
      `Investigate rage clicks on: ${urls.join(", ")}. Elements may be unresponsive, slow to load, or visually misleading.`
    );
  }

  const deadClicks = allSignals.filter((s) => s.type === "dead_click");
  if (deadClicks.length > 0) {
    recs.push(
      `${deadClicks.length} dead click(s) detected. Review elements that look clickable but are not interactive — consider adding hover states or removing misleading visual cues.`
    );
  }

  const navLoops = allSignals.filter((s) => s.type === "navigation_loop");
  if (navLoops.length > 0) {
    recs.push(
      `Navigation loops detected — users are going in circles. Improve wayfinding with clearer navigation labels, breadcrumbs, or better information architecture.`
    );
  }

  // Task-based recommendations
  const failedTasks = results.flatMap((r) => r.tasks.filter((t) => !t.completed));
  if (failedTasks.length > 0) {
    const taskIds = [...new Set(failedTasks.map((t) => t.taskId))];
    recs.push(
      `${failedTasks.length} task failure(s) across tasks: ${taskIds.join(", ")}. Review these user flows for clarity and completeness.`
    );
  }

  // Accessibility recommendations
  const keyboardResult = results.find((r) => r.personaId === "keyboard-only");
  if (keyboardResult && keyboardResult.frustrationSignals.length > 0) {
    recs.push(
      `${keyboardResult.frustrationSignals.length} accessibility issue(s) found by keyboard-only testing. Ensure all interactive elements are focusable with visible focus indicators.`
    );
  }

  // Design recommendations from UI/UX personas
  const designPersonaIds = new Set([
    "visual-design-critic",
    "interface-design-evaluator",
    "design-consistency-auditor",
    "motion-animation-evaluator",
    "typography-color-critic",
  ]);
  const designResults = results.filter((r) => designPersonaIds.has(r.personaId));
  const designSignals = designResults.flatMap((r) => r.frustrationSignals);
  if (designSignals.length > 0) {
    const highDesign = designSignals.filter((s) => s.severity === "high");
    if (highDesign.length > 0) {
      recs.push(
        `${highDesign.length} high-severity design issue(s) found by UI/UX design personas. Review visual consistency, typography hierarchy, color intentionality, and motion quality.`
      );
    } else {
      recs.push(
        `${designSignals.length} design observation(s) from UI/UX personas. Review the detailed findings for visual design, interface design, and consistency improvements.`
      );
    }
  }

  if (recs.length === 0) {
    recs.push("No major issues detected. Consider running with additional personas or more complex tasks for deeper coverage.");
  }

  return recs;
}

function buildFirstInteractions(results: PersonaResult[]): FirstInteraction[] {
  const allInteractions = results.flatMap((r) => r.interactions);
  const firstByUrl = findFirstInteractions(allInteractions);

  return Array.from(firstByUrl.entries()).map(([url, event]) => ({
    url,
    firstAction: `${event.type}${event.targetText ? ` on "${event.targetText}"` : ""}${event.targetSelector ? ` (${event.targetSelector})` : ""}`,
    targetSelector: event.targetSelector,
  }));
}

function buildExecutiveSummary(
  results: PersonaResult[],
  thresholds: ThresholdConfig
): ExecutiveSummary {
  const totalFrustration = results.reduce((sum, r) => sum + r.frustrationSignals.length, 0);
  const totalTasks = results.flatMap((r) => r.tasks);
  const completedTasks = totalTasks.filter((t) => t.completed).length;
  const completionRate = totalTasks.length > 0 ? completedTasks / totalTasks.length : 1;

  // Determine per-persona verdicts
  const personaVerdicts = results.map((r) => {
    const taskRate = r.tasks.length > 0 ? r.tasks.filter((t) => t.completed).length / r.tasks.length : 1;
    const frustrations = r.frustrationSignals.length;
    let verdict: string;
    let status: "pass" | "warn" | "fail";

    if (taskRate >= 0.8 && frustrations <= 1) {
      verdict = "Smooth experience";
      status = "pass";
    } else if (taskRate >= 0.5 || frustrations <= 3) {
      verdict = `${frustrations} frustrations, ${Math.round(taskRate * 100)}% tasks`;
      status = "warn";
    } else {
      verdict = `Failed — ${frustrations} frustrations, ${Math.round(taskRate * 100)}% tasks`;
      status = "fail";
    }

    return { personaId: r.personaId, personaLabel: r.personaLabel, verdict, status };
  });

  // Overall verdict
  const failCount = personaVerdicts.filter((v) => v.status === "fail").length;
  const passCount = personaVerdicts.filter((v) => v.status === "pass").length;
  let overallVerdict: ExecutiveSummary["overallVerdict"];
  if (failCount > results.length / 2) overallVerdict = "unusable";
  else if (failCount > 0) overallVerdict = "frustrating";
  else if (passCount === results.length) overallVerdict = "excellent";
  else if (passCount >= results.length / 2) overallVerdict = "good";
  else overallVerdict = "mixed";

  // Key findings (top 5 auto-generated)
  const keyFindings: string[] = [];

  if (completionRate < (thresholds.minTaskCompletionRate ?? 0.8)) {
    keyFindings.push(`Task completion rate is ${Math.round(completionRate * 100)}% — below the ${Math.round((thresholds.minTaskCompletionRate ?? 0.8) * 100)}% threshold.`);
  }

  const highFrustrations = results.flatMap((r) => r.frustrationSignals).filter((s) => s.severity === "high");
  if (highFrustrations.length > 0) {
    keyFindings.push(`${highFrustrations.length} high-severity frustration signal(s) detected across personas.`);
  }

  const failedPersonas = personaVerdicts.filter((v) => v.status === "fail");
  if (failedPersonas.length > 0) {
    keyFindings.push(`${failedPersonas.length} persona(s) had a poor experience: ${failedPersonas.map((p) => p.personaLabel).join(", ")}.`);
  }

  const passedPersonas = personaVerdicts.filter((v) => v.status === "pass");
  if (passedPersonas.length > 0) {
    keyFindings.push(`${passedPersonas.length} persona(s) had a smooth experience: ${passedPersonas.map((p) => p.personaLabel).join(", ")}.`);
  }

  if (totalFrustration === 0 && completionRate === 1) {
    keyFindings.push("All personas completed all tasks with no frustration signals.");
  }

  return { overallVerdict, keyFindings, personaVerdicts };
}

/**
 * Shorten a URL to a readable path label for flow diagrams.
 */
function urlToPathLabel(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "" : u.pathname.replace(/^\//, "").replace(/\/$/, "");
    if (!path) return "Home";
    return "/" + path;
  } catch {
    return url.slice(0, 30);
  }
}

/**
 * Build a label for a page visit. Uses the page title when it's unique
 * across all visits; falls back to the URL path slug when multiple
 * pages share the same title (e.g. an SPA that always sets "Home").
 */
function resolveLabels(visits: PageVisit[]): Map<string, string> {
  // Collect title per unique URL
  const urlTitle = new Map<string, string>();
  for (const v of visits) {
    if (!urlTitle.has(v.url)) urlTitle.set(v.url, v.title?.trim() || "");
  }

  // Find which titles are shared by multiple distinct URLs
  const titleUrls = new Map<string, Set<string>>();
  for (const [url, title] of urlTitle) {
    const key = title.toLowerCase();
    if (!titleUrls.has(key)) titleUrls.set(key, new Set());
    titleUrls.get(key)!.add(url);
  }

  const labels = new Map<string, string>();
  for (const [url, title] of urlTitle) {
    const key = title.toLowerCase();
    const isDuplicate = (titleUrls.get(key)?.size ?? 0) > 1;

    if (!title || isDuplicate) {
      // No title or title collision — use the URL path as the label
      labels.set(url, urlToPathLabel(url));
    } else {
      labels.set(url, title);
    }
  }

  return labels;
}

function buildPersonaFlows(results: PersonaResult[]): PersonaFlow[] {
  // Resolve labels across ALL personas so the same URL gets the same label everywhere
  const allVisits = results.flatMap((r) => r.navigationPath);
  const labelMap = resolveLabels(allVisits);

  return results.map((r) => {
    const visits = r.navigationPath;
    if (visits.length === 0) {
      return {
        personaId: r.personaId,
        personaLabel: r.personaLabel,
        steps: [],
        mermaidCode: "graph LR\n  empty[No pages visited]",
      };
    }

    // Deduplicate consecutive visits to the same URL
    const steps: PersonaFlow["steps"] = [];
    for (const v of visits) {
      if (steps.length === 0 || steps[steps.length - 1].url !== v.url) {
        steps.push({ label: labelMap.get(v.url) ?? urlToPathLabel(v.url), url: v.url, dwellMs: v.dwellTimeMs });
      } else {
        // Merge dwell time for consecutive visits to same page
        steps[steps.length - 1].dwellMs += v.dwellTimeMs;
      }
    }

    // Build Mermaid graph
    const nodeIds = steps.map((_, i) => `n${i}`);
    let mermaid = "graph LR\n";

    for (let i = 0; i < steps.length; i++) {
      const label = steps[i].label.replace(/"/g, "'");
      const dwell = steps[i].dwellMs > 0 ? ` (${(steps[i].dwellMs / 1000).toFixed(0)}s)` : "";
      mermaid += `  ${nodeIds[i]}["${label}${dwell}"]\n`;
    }

    for (let i = 0; i < steps.length - 1; i++) {
      mermaid += `  ${nodeIds[i]} --> ${nodeIds[i + 1]}\n`;
    }

    return { personaId: r.personaId, personaLabel: r.personaLabel, steps, mermaidCode: mermaid };
  });
}
