import type {
  PageVisit,
  InteractionEvent,
  PerformanceSnapshot,
  FrustrationSignal,
  TaskResult,
} from "../types.js";
import type {
  RawPageVisit,
  RawPerformanceData,
  RawInteraction,
  RawFrustration,
  RawTaskResult,
} from "./types.js";

export class MetricsStore {
  private pageVisits: PageVisit[] = [];
  private interactions: InteractionEvent[] = [];
  private performanceSnapshots: PerformanceSnapshot[] = [];
  private frustrationSignals: FrustrationSignal[] = [];
  private taskResults: TaskResult[] = [];

  addPageVisit(raw: RawPageVisit): void {
    const now = Date.now();
    const prev = this.pageVisits[this.pageVisits.length - 1];
    if (prev && prev.dwellTimeMs === 0) {
      prev.dwellTimeMs = now - prev.timestampMs;
    }
    this.pageVisits.push({
      url: raw.url,
      title: raw.title,
      timestampMs: now,
      dwellTimeMs: 0,
      scrollDepthPercent: raw.scrollDepthPercent,
    });
  }

  addInteraction(raw: RawInteraction): void {
    this.interactions.push({
      type: raw.type,
      targetSelector: raw.targetSelector,
      targetText: raw.targetText,
      url: raw.url,
      timestampMs: Date.now(),
      coordinates:
        raw.coordinateX != null && raw.coordinateY != null
          ? { x: raw.coordinateX, y: raw.coordinateY }
          : undefined,
    });
  }

  addPerformanceSnapshot(raw: RawPerformanceData): void {
    this.performanceSnapshots.push({
      url: raw.url,
      timestampMs: Date.now(),
      lcp: raw.lcp ?? undefined,
      cls: raw.cls ?? undefined,
      tbt: raw.tbt ?? undefined,
      pageLoadMs: raw.pageLoadMs ?? undefined,
      domContentLoadedMs: raw.domContentLoadedMs ?? undefined,
      resourceCount: raw.resourceCount ?? undefined,
      totalTransferSizeBytes: raw.totalTransferSizeBytes ?? undefined,
    });
  }

  addFrustrationSignal(raw: RawFrustration): void {
    this.frustrationSignals.push({
      type: raw.type,
      url: raw.url,
      timestampMs: Date.now(),
      description: raw.description,
      severity: raw.severity,
      coordinates:
        raw.coordinateX != null && raw.coordinateY != null
          ? { x: raw.coordinateX, y: raw.coordinateY }
          : undefined,
      targetSelector: raw.targetSelector,
    });
  }

  addTaskResult(raw: RawTaskResult): void {
    this.taskResults.push({
      taskId: raw.taskId,
      completed: raw.completed,
      timeMs: raw.timeMs,
      stepsCount: raw.stepsCount,
      errorMessages: raw.errorMessages,
      navigationPath: raw.navigationPath,
    });
  }

  getPageVisits(): PageVisit[] {
    return [...this.pageVisits];
  }

  getInteractions(): InteractionEvent[] {
    return [...this.interactions];
  }

  getPerformanceSnapshots(): PerformanceSnapshot[] {
    return [...this.performanceSnapshots];
  }

  getFrustrationSignals(): FrustrationSignal[] {
    return [...this.frustrationSignals];
  }

  getTaskResults(): TaskResult[] {
    return [...this.taskResults];
  }
}
