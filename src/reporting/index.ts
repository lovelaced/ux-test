import type { PersonaResult, TestConfig } from "../types.js";
import type { AggregatedReport } from "./types.js";
import { aggregateResults } from "./aggregator.js";
import { writeReport } from "./formatter.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("reporting");

export function generateReport(
  results: PersonaResult[],
  config: TestConfig
): AggregatedReport {
  log.info("Aggregating results from %d persona(s)...", results.length);

  const report = aggregateResults(results, config);

  const outputDir = config.outputDir ?? "./results";
  const formats = config.outputFormat ?? ["json", "markdown"];

  writeReport(report, outputDir, formats);

  log.info(
    `Report written to ${outputDir}/ (${formats.join(", ")})`
  );

  // Print summary to console
  console.log("\n=== UX TEST RESULTS ===\n");
  console.log(`URL: ${report.summary.url}`);
  console.log(`Personas: ${report.summary.personaCount}`);
  console.log(`Duration: ${(report.summary.totalDurationMs / 1000).toFixed(1)}s`);
  console.log(`Web Vitals: ${report.performanceAnalysis.webVitalsPass ? "PASS" : "FAIL"}`);
  console.log(`Issues: ${report.issuesList.length}`);

  if (report.issuesList.length > 0) {
    console.log("\nTop Issues:");
    for (const issue of report.issuesList.slice(0, 5)) {
      console.log(`  [${issue.severity.toUpperCase()}] ${issue.description}`);
    }
  }

  if (report.recommendations.length > 0) {
    console.log("\nRecommendations:");
    for (const rec of report.recommendations) {
      console.log(`  - ${rec}`);
    }
  }

  console.log(`\nFull report: ${outputDir}/\n`);

  return report;
}
