/**
 * JavaScript snippet to evaluate via browser_evaluate for collecting
 * Core Web Vitals and performance metrics from the current page.
 *
 * Returns a JSON string with performance data.
 */
export const PERFORMANCE_JS_SNIPPET = `
(() => {
  const nav = performance.getEntriesByType('navigation')[0];

  // LCP — last entry is the final LCP candidate
  let lcp = null;
  try {
    const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
    if (lcpEntries.length > 0) {
      lcp = lcpEntries[lcpEntries.length - 1].startTime;
    }
  } catch (e) {}

  // CLS — sum of layout shifts without recent input
  let cls = 0;
  try {
    const clsEntries = performance.getEntriesByType('layout-shift');
    for (const entry of clsEntries) {
      if (!entry.hadRecentInput) cls += entry.value;
    }
  } catch (e) {}

  // TBT — sum of blocking time from long tasks (>50ms)
  let tbt = 0;
  try {
    const longTasks = performance.getEntriesByType('longtask');
    for (const task of longTasks) {
      if (task.duration > 50) tbt += task.duration - 50;
    }
  } catch (e) {}

  // Resource summary
  const resources = performance.getEntriesByType('resource');
  const resourceCount = resources.length;
  let totalTransferSizeBytes = 0;
  for (const r of resources) {
    totalTransferSizeBytes += r.transferSize || 0;
  }

  return JSON.stringify({
    pageLoadMs: nav ? Math.round(nav.loadEventEnd - nav.startTime) : null,
    domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd - nav.startTime) : null,
    lcp: lcp != null ? Math.round(lcp) : null,
    cls: Math.round(cls * 1000) / 1000,
    tbt: Math.round(tbt),
    resourceCount,
    totalTransferSizeBytes,
  });
})()
`.trim();
