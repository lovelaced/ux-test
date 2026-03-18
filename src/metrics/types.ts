export interface RawPageVisit {
  url: string;
  title: string;
  scrollDepthPercent: number;
}

export interface RawPerformanceData {
  url: string;
  pageLoadMs?: number;
  domContentLoadedMs?: number;
  lcp?: number;
  cls?: number;
  tbt?: number;
  resourceCount?: number;
  totalTransferSizeBytes?: number;
}

export interface RawInteraction {
  type: "click" | "scroll" | "type" | "navigate" | "hover" | "select";
  targetSelector?: string;
  targetText?: string;
  url: string;
  coordinateX?: number;
  coordinateY?: number;
}

export interface RawFrustration {
  type:
    | "rage_click"
    | "dead_click"
    | "navigation_loop"
    | "excessive_dwell"
    | "error_click"
    | "repeated_action";
  url: string;
  description: string;
  severity: "low" | "medium" | "high";
  targetSelector?: string;
  coordinateX?: number;
  coordinateY?: number;
}

export interface RawTaskResult {
  taskId: string;
  completed: boolean;
  timeMs: number;
  stepsCount: number;
  errorMessages: string[];
  navigationPath: string[];
}
