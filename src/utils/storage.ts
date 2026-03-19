import { mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { PersonaResult, TestConfig } from "../types.js";
import type { AggregatedReport } from "../reporting/types.js";
import { createLogger } from "./logger.js";

const log = createLogger("storage");

const RESULTS_DIR = "results";

export interface RunMeta {
  runId: string;
  url: string;
  testDate: string;
  personaCount: number;
  personaIds: string[];
  durationMs: number;
  issueCount: number;
  frustrationCount: number;
  verdict: string;
}

/**
 * Build a filesystem-safe, sortable run folder name.
 * Format: {ISO date}_{hostname}
 * Example: 2026-03-19T14-32-07_example-com
 */
function buildRunId(url: string, date: Date): string {
  const timestamp = date.toISOString().replace(/:/g, "-").replace(/\.\d+Z$/, "");
  let hostname = "unknown";
  try {
    hostname = new URL(url).hostname.replace(/[^a-zA-Z0-9.-]/g, "_");
  } catch {}
  return `${timestamp}_${hostname}`;
}

/**
 * Persist a complete test run to disk.
 * Creates:
 *   results/{runId}/meta.json
 *   results/{runId}/report.json
 *   results/{runId}/personas/{personaId}.json
 */
export function saveRun(
  config: TestConfig,
  results: PersonaResult[],
  report: AggregatedReport
): string {
  const runId = buildRunId(config.url, new Date(report.summary.testDate));
  const runDir = join(RESULTS_DIR, runId);
  const personaDir = join(runDir, "personas");

  mkdirSync(personaDir, { recursive: true });

  // Meta — lightweight index entry
  const meta: RunMeta = {
    runId,
    url: config.url,
    testDate: report.summary.testDate,
    personaCount: results.length,
    personaIds: results.map((r) => r.personaId),
    durationMs: report.summary.totalDurationMs,
    issueCount: report.issuesList.length,
    frustrationCount: report.frustrationAnalysis.totalSignals,
    verdict: report.executiveSummary?.overallVerdict ?? "unknown",
  };
  writeFileSync(join(runDir, "meta.json"), JSON.stringify(meta, null, 2));

  // Full aggregated report
  writeFileSync(join(runDir, "report.json"), JSON.stringify(report, null, 2));

  // Individual persona results
  for (const result of results) {
    const filename = `${result.personaId}.json`;
    writeFileSync(join(personaDir, filename), JSON.stringify(result, null, 2));
  }

  log.info(`Run saved to ${runDir}/`);
  return runId;
}

/**
 * List all saved runs, sorted newest first.
 */
export function listRuns(): RunMeta[] {
  if (!existsSync(RESULTS_DIR)) return [];

  const entries = readdirSync(RESULTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .reverse(); // newest first (ISO timestamps sort lexicographically)

  const runs: RunMeta[] = [];
  for (const dir of entries) {
    const metaPath = join(RESULTS_DIR, dir, "meta.json");
    if (!existsSync(metaPath)) continue;
    try {
      const meta = JSON.parse(readFileSync(metaPath, "utf-8")) as RunMeta;
      runs.push(meta);
    } catch {
      // skip corrupted entries
    }
  }

  return runs;
}

/**
 * Load the full report for a saved run.
 */
export function loadReport(runId: string): AggregatedReport | null {
  const reportPath = join(RESULTS_DIR, runId, "report.json");
  if (!existsSync(reportPath)) return null;
  try {
    return JSON.parse(readFileSync(reportPath, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Load an individual persona result from a saved run.
 */
export function loadPersonaResult(runId: string, personaId: string): PersonaResult | null {
  const path = join(RESULTS_DIR, runId, "personas", `${personaId}.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}
