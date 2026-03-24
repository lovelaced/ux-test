import type { FrustrationSignal } from "../types.js";
import type { ClickHeatmapByUrl } from "../metrics/interaction.js";

export interface AggregatedReport {
  summary: {
    url: string;
    testDate: string;
    personaCount: number;
    totalDurationMs: number;
  };
  taskAnalysis: TaskAnalysis[];
  performanceAnalysis: PerformanceAnalysis;
  frustrationAnalysis: FrustrationAnalysis;
  navigationAnalysis: NavigationAnalysis;
  heatmapData: ClickHeatmapByUrl[];
  issuesList: SeverityRankedIssue[];
  personaSummaries: PersonaSummary[];
  recommendations: string[];
  firstInteractions: FirstInteraction[];
  executiveSummary: ExecutiveSummary;
  personaFlows: PersonaFlow[];
}

export interface ExecutiveSummary {
  overallVerdict: "excellent" | "good" | "frustrating" | "unusable" | "mixed";
  keyFindings: string[];
  personaVerdicts: { personaId: string; personaLabel: string; verdict: string; status: "pass" | "warn" | "fail" }[];
}

export interface PersonaFlow {
  personaId: string;
  personaLabel: string;
  /** Ordered list of short page labels visited */
  steps: { label: string; url: string; dwellMs: number }[];
  /** Mermaid graph syntax for this persona's flow */
  mermaidCode: string;
}


export interface TaskAnalysis {
  taskId: string;
  taskDescription: string;
  completionRate: number;
  avgTimeMs: number;
  medianTimeMs: number;
  avgSteps: number;
  personaBreakdown: {
    personaId: string;
    completed: boolean;
    timeMs: number;
    steps: number;
    errors: string[];
  }[];
}

export interface PerformanceAnalysis {
  avgLCP: number | null;
  avgCLS: number | null;
  avgTBT: number | null;
  avgPageLoadMs: number | null;
  slowestPages: { url: string; pageLoadMs: number }[];
  webVitalsPass: boolean;
}

export interface FrustrationAnalysis {
  totalSignals: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  topFrustrationUrls: {
    url: string;
    count: number;
    signals: FrustrationSignal[];
  }[];
}

export interface NavigationAnalysis {
  mostVisitedPages: { url: string; visitCount: number }[];
  commonPaths: string[][];
  deadEndPages: string[];
  pageEngagement: PageEngagement[];
}

export interface PageEngagement {
  url: string;
  avgScrollDepthPercent: number;
  avgDwellTimeMs: number;
  visitCount: number;
}

export interface FirstInteraction {
  url: string;
  firstAction: string;
  targetSelector?: string;
}

export interface SeverityRankedIssue {
  severity: "critical" | "high" | "medium" | "low";
  category: "performance" | "usability" | "accessibility" | "functionality" | "design";
  description: string;
  affectedPersonas: string[];
  url: string;
  evidence: string;
}

export interface PersonaSummary {
  personaId: string;
  personaLabel: string;
  agentNarrative: string;
  taskCompletionRate: number;
  frustrationCount: number;
  avgTaskTimeMs: number;
  durationMs: number;
}
