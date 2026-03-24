// ── Configuration ──

export interface TestConfig {
  url: string;
  tasks?: TaskDefinition[];
  personas?: PersonaId[];
  concurrency?: number;
  maxTurnsPerPersona?: number;
  maxTimePerPersonaSeconds?: number;
  thresholds?: ThresholdConfig;
  headless?: boolean;
  browserType?: "chromium" | "chrome" | "firefox" | "webkit";
  viewportSize?: { width: number; height: number };
  outputDir?: string;
  outputFormat?: OutputFormat[];
  verbose?: boolean;
  auth?: AuthConfig;
}

export interface TaskDefinition {
  id: string;
  description: string;
  successCriteria?: string;
  maxTimeSeconds?: number;
}

export interface ThresholdConfig {
  maxLCP?: number;
  maxCLS?: number;
  maxTBT?: number;
  maxTaskTimeSeconds?: number;
  minTaskCompletionRate?: number;
}

export interface AuthConfig {
  username?: string;
  password?: string;
  cookies?: { name: string; value: string; domain: string }[];
}

export type OutputFormat = "json" | "markdown" | "html";

export type PersonaId =
  | "novice-goal-directed"
  | "novice-explorer"
  | "intermediate-goal-directed"
  | "power-user"
  | "impatient-scanner"
  | "keyboard-only"
  | "screen-reader"
  | "search-first"
  | "mobile-novice"
  | "mobile-power"
  | "mobile-technical"
  | "mobile-commuter"
  | "mobile-elderly"
  | "mobile-multitasker"
  | "visual-design-critic"
  | "interface-design-evaluator"
  | "design-consistency-auditor"
  | "motion-animation-evaluator"
  | "typography-color-critic";

// ── Results ──

export interface PersonaResult {
  personaId: string;
  personaLabel: string;
  sessionId: string;
  tasks: TaskResult[];
  navigationPath: PageVisit[];
  interactions: InteractionEvent[];
  performanceSnapshots: PerformanceSnapshot[];
  frustrationSignals: FrustrationSignal[];
  agentTranscriptSummary: string;
  durationMs: number;
}

export interface TaskResult {
  taskId: string;
  completed: boolean;
  timeMs: number;
  stepsCount: number;
  errorMessages: string[];
  navigationPath: string[];
}

export interface PageVisit {
  url: string;
  title: string;
  timestampMs: number;
  dwellTimeMs: number;
  scrollDepthPercent: number;
}

export interface InteractionEvent {
  type: "click" | "scroll" | "type" | "navigate" | "hover" | "select";
  targetSelector?: string;
  targetText?: string;
  url: string;
  timestampMs: number;
  coordinates?: { x: number; y: number };
}

export interface PerformanceSnapshot {
  url: string;
  timestampMs: number;
  lcp?: number;
  cls?: number;
  tbt?: number;
  pageLoadMs?: number;
  domContentLoadedMs?: number;
  resourceCount?: number;
  totalTransferSizeBytes?: number;
  resourceTimings?: ResourceTiming[];
}

export interface ResourceTiming {
  name: string;
  initiatorType: string;
  durationMs: number;
  transferSizeBytes: number;
}

export interface FrustrationSignal {
  type:
    | "rage_click"
    | "dead_click"
    | "navigation_loop"
    | "excessive_dwell"
    | "error_click"
    | "repeated_action";
  personaId?: string;
  url: string;
  timestampMs: number;
  description: string;
  severity: "low" | "medium" | "high";
  coordinates?: { x: number; y: number };
  targetSelector?: string;
}

// ── Progress Events ──

export type TestProgressEvent =
  | { type: "test:start"; personaCount: number; concurrency: number }
  | { type: "persona:start"; personaId: string; personaLabel: string }
  | { type: "persona:tool_use"; personaId: string; toolName: string }
  | {
      type: "persona:complete";
      personaId: string;
      personaLabel: string;
      durationMs: number;
      tasksCompleted: number;
      tasksTotal: number;
    }
  | { type: "persona:error"; personaId: string; personaLabel: string; error: string }
  | {
      type: "test:complete";
      resultCount: number;
      totalPersonas: number;
      wallClockMs: number;
    }
  | { type: "report:ready" }
  | { type: "test:error"; error: string };

// ── Defaults ──

export const DEFAULT_CONFIG = {
  concurrency: 3,
  maxTurnsPerPersona: 25,
  maxTimePerPersonaSeconds: 300,
  headless: true,
  browserType: "chromium" as const,
  viewportSize: { width: 1280, height: 720 },
  outputDir: "./results",
  outputFormat: ["json", "markdown"] as OutputFormat[],
  thresholds: {
    maxLCP: 2500,
    maxCLS: 0.1,
    maxTBT: 200,
    maxTaskTimeSeconds: 120,
    minTaskCompletionRate: 0.8,
  },
} satisfies Partial<TestConfig>;
