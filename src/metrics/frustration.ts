import type {
  InteractionEvent,
  PageVisit,
  FrustrationSignal,
} from "../types.js";

const RAGE_CLICK_WINDOW_MS = 1000;
const RAGE_CLICK_MIN_COUNT = 3;
const RAGE_CLICK_PROXIMITY_PX = 30;
const NAVIGATION_LOOP_THRESHOLD = 3;
const EXCESSIVE_DWELL_MS = 60_000;

/**
 * Post-processing analysis of raw interaction and navigation data
 * to detect frustration signals the agent may have missed.
 */
export function detectFrustrationSignals(
  interactions: InteractionEvent[],
  pageVisits: PageVisit[]
): FrustrationSignal[] {
  const signals: FrustrationSignal[] = [];

  signals.push(...detectRageClicks(interactions));
  signals.push(...detectNavigationLoops(pageVisits));
  signals.push(...detectExcessiveDwell(pageVisits, interactions));

  return signals;
}

function detectRageClicks(
  interactions: InteractionEvent[]
): FrustrationSignal[] {
  const signals: FrustrationSignal[] = [];
  const clicks = interactions.filter(
    (i) => i.type === "click" && i.coordinates
  );

  for (let i = 0; i < clicks.length; i++) {
    const cluster: InteractionEvent[] = [clicks[i]];
    const anchor = clicks[i];

    for (let j = i + 1; j < clicks.length; j++) {
      const dt = clicks[j].timestampMs - anchor.timestampMs;
      if (dt > RAGE_CLICK_WINDOW_MS) break;

      const dx = Math.abs(clicks[j].coordinates!.x - anchor.coordinates!.x);
      const dy = Math.abs(clicks[j].coordinates!.y - anchor.coordinates!.y);
      if (dx <= RAGE_CLICK_PROXIMITY_PX && dy <= RAGE_CLICK_PROXIMITY_PX) {
        cluster.push(clicks[j]);
      }
    }

    if (cluster.length >= RAGE_CLICK_MIN_COUNT) {
      signals.push({
        type: "rage_click",
        url: anchor.url,
        timestampMs: anchor.timestampMs,
        description: `${cluster.length} rapid clicks near (${anchor.coordinates!.x}, ${anchor.coordinates!.y})${anchor.targetSelector ? ` on ${anchor.targetSelector}` : ""}`,
        severity: "high",
        coordinates: anchor.coordinates,
        targetSelector: anchor.targetSelector,
      });
      // Skip ahead past this cluster
      i += cluster.length - 1;
    }
  }

  return signals;
}

function detectNavigationLoops(pageVisits: PageVisit[]): FrustrationSignal[] {
  const signals: FrustrationSignal[] = [];

  // Sliding window: check for repeated URL patterns
  const urlSequence = pageVisits.map((v) => v.url);
  const urlCounts = new Map<string, number>();

  for (const url of urlSequence) {
    urlCounts.set(url, (urlCounts.get(url) || 0) + 1);
  }

  for (const [url, count] of urlCounts) {
    if (count >= NAVIGATION_LOOP_THRESHOLD) {
      signals.push({
        type: "navigation_loop",
        url,
        timestampMs: pageVisits.find((v) => v.url === url)!.timestampMs,
        description: `Page visited ${count} times, indicating the user may be lost or going in circles`,
        severity: count >= 5 ? "high" : "medium",
      });
    }
  }

  return signals;
}

function detectExcessiveDwell(
  pageVisits: PageVisit[],
  interactions: InteractionEvent[]
): FrustrationSignal[] {
  const signals: FrustrationSignal[] = [];

  for (const visit of pageVisits) {
    if (visit.dwellTimeMs < EXCESSIVE_DWELL_MS) continue;

    // Check if there were meaningful interactions during this dwell
    const interactionsDuring = interactions.filter(
      (i) =>
        i.url === visit.url &&
        i.timestampMs >= visit.timestampMs &&
        i.timestampMs <= visit.timestampMs + visit.dwellTimeMs &&
        i.type !== "scroll"
    );

    // If very few interactions during a long dwell, it's suspicious
    if (interactionsDuring.length <= 1) {
      signals.push({
        type: "excessive_dwell",
        url: visit.url,
        timestampMs: visit.timestampMs,
        description: `User spent ${Math.round(visit.dwellTimeMs / 1000)}s on page with minimal interaction — possible confusion or information overload`,
        severity:
          visit.dwellTimeMs > EXCESSIVE_DWELL_MS * 2 ? "high" : "medium",
      });
    }
  }

  return signals;
}
