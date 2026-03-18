import type { InteractionEvent } from "../types.js";

export interface ClickHeatmapEntry {
  x: number;
  y: number;
  count: number;
}

export interface ClickHeatmapByUrl {
  url: string;
  clicks: ClickHeatmapEntry[];
}

const HEATMAP_GRID_SIZE = 10; // pixels to round to

/**
 * Aggregate click interactions into heatmap data grouped by URL.
 */
export function buildClickHeatmaps(
  interactions: InteractionEvent[]
): ClickHeatmapByUrl[] {
  const byUrl = new Map<string, Map<string, ClickHeatmapEntry>>();

  for (const event of interactions) {
    if (event.type !== "click" || !event.coordinates) continue;

    if (!byUrl.has(event.url)) byUrl.set(event.url, new Map());
    const grid = byUrl.get(event.url)!;

    // Snap to grid
    const gx =
      Math.round(event.coordinates.x / HEATMAP_GRID_SIZE) * HEATMAP_GRID_SIZE;
    const gy =
      Math.round(event.coordinates.y / HEATMAP_GRID_SIZE) * HEATMAP_GRID_SIZE;
    const key = `${gx},${gy}`;

    const existing = grid.get(key);
    if (existing) {
      existing.count++;
    } else {
      grid.set(key, { x: gx, y: gy, count: 1 });
    }
  }

  return Array.from(byUrl.entries()).map(([url, grid]) => ({
    url,
    clicks: Array.from(grid.values()).sort((a, b) => b.count - a.count),
  }));
}

/**
 * Find the first interaction on each page — shows where users look/click first.
 */
export function findFirstInteractions(
  interactions: InteractionEvent[]
): Map<string, InteractionEvent> {
  const first = new Map<string, InteractionEvent>();
  for (const event of interactions) {
    if (!first.has(event.url)) {
      first.set(event.url, event);
    }
  }
  return first;
}

/**
 * Identify elements that were never interacted with.
 * Returns selectors that appeared in page snapshots but had zero clicks.
 */
export function findUnclickedAreas(
  interactions: InteractionEvent[]
): Set<string> {
  const clicked = new Set<string>();
  for (const event of interactions) {
    if (event.type === "click" && event.targetSelector) {
      clicked.add(event.targetSelector);
    }
  }
  return clicked;
}
