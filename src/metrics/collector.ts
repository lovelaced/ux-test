import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { MetricsStore } from "./index.js";
import { PERFORMANCE_JS_SNIPPET } from "./performance.js";

type ToolResult = { content: { type: "text"; text: string }[] };

function ok(msg: string): ToolResult {
  return { content: [{ type: "text" as const, text: msg }] };
}

function err(msg: string): ToolResult {
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }] };
}

export function createMetricsCollectorServer(store: MetricsStore) {
  const recordPageVisit = tool(
    "record_page_visit",
    "Record a page visit. Call this after EVERY navigation to a new page.",
    {
      url: z.string().describe("The full URL of the page"),
      title: z.string().describe("The page title"),
      scrollDepthPercent: z
        .number()
        .min(0)
        .max(100)
        .default(0)
        .describe("How far down the page you scrolled (0-100)"),
    },
    async (args) => {
      try {
        store.addPageVisit(args);
        return ok("Page visit recorded.");
      } catch (e) {
        return err(`recording page visit: ${e}`);
      }
    }
  );

  const capturePerformance = tool(
    "capture_performance",
    "Record performance metrics for the current page. First call get_performance_js to get the JS snippet, evaluate it with browser_evaluate, then pass the parsed results here.",
    {
      url: z.string().describe("The URL of the page"),
      pageLoadMs: z.number().nullable().optional().describe("Total page load time in ms"),
      domContentLoadedMs: z.number().nullable().optional().describe("DOM content loaded time in ms"),
      lcp: z.number().nullable().optional().describe("Largest Contentful Paint in ms"),
      cls: z.number().nullable().optional().describe("Cumulative Layout Shift score"),
      tbt: z.number().nullable().optional().describe("Total Blocking Time in ms"),
      resourceCount: z.number().optional().describe("Number of resources loaded"),
      totalTransferSizeBytes: z.number().optional().describe("Total bytes transferred"),
    },
    async (args) => {
      try {
        store.addPerformanceSnapshot({
          url: args.url,
          pageLoadMs: args.pageLoadMs ?? undefined,
          domContentLoadedMs: args.domContentLoadedMs ?? undefined,
          lcp: args.lcp ?? undefined,
          cls: args.cls ?? undefined,
          tbt: args.tbt ?? undefined,
          resourceCount: args.resourceCount,
          totalTransferSizeBytes: args.totalTransferSizeBytes,
        });
        return ok("Performance metrics recorded.");
      } catch (e) {
        return err(`recording performance: ${e}`);
      }
    }
  );

  const recordInteraction = tool(
    "record_interaction",
    "Record a user interaction event. Call this after EVERY click, scroll, type, or navigation action.",
    {
      type: z
        .enum(["click", "scroll", "type", "navigate", "hover", "select"])
        .describe("The type of interaction"),
      targetSelector: z.string().optional().describe("CSS selector or accessible name of the target element"),
      targetText: z.string().optional().describe("Visible text of the target element"),
      url: z.string().describe("The URL where the interaction occurred"),
      coordinateX: z.number().optional().describe("X coordinate of the interaction"),
      coordinateY: z.number().optional().describe("Y coordinate of the interaction"),
    },
    async (args) => {
      try {
        store.addInteraction(args);
        return ok("Interaction recorded.");
      } catch (e) {
        return err(`recording interaction: ${e}`);
      }
    }
  );

  const recordFrustration = tool(
    "record_frustration",
    "Record a frustration signal when you experience difficulty or notice a UX problem.",
    {
      type: z
        .enum([
          "rage_click",
          "dead_click",
          "navigation_loop",
          "excessive_dwell",
          "error_click",
          "repeated_action",
        ])
        .describe("The type of frustration signal"),
      url: z.string().describe("The URL where the frustration occurred"),
      description: z.string().describe("What happened and why it was frustrating"),
      severity: z
        .enum(["low", "medium", "high"])
        .describe("How severe the frustration was"),
      targetSelector: z.string().optional().describe("The element that caused frustration"),
      coordinateX: z.number().optional().describe("X coordinate"),
      coordinateY: z.number().optional().describe("Y coordinate"),
    },
    async (args) => {
      try {
        store.addFrustrationSignal(args);
        return ok("Frustration signal recorded.");
      } catch (e) {
        return err(`recording frustration: ${e}`);
      }
    }
  );

  const recordTaskResult = tool(
    "record_task_result",
    "Record the result of attempting a task. Call after each task attempt, whether successful or not.",
    {
      taskId: z.string().describe("The task ID"),
      completed: z.boolean().describe("Whether the task was completed successfully"),
      timeMs: z.number().describe("Time spent on the task in milliseconds"),
      stepsCount: z.number().describe("Number of actions taken to complete/attempt the task"),
      errorMessages: z
        .array(z.string())
        .default([])
        .describe("Any error messages encountered"),
      navigationPath: z
        .array(z.string())
        .default([])
        .describe("URLs visited during the task"),
    },
    async (args) => {
      try {
        store.addTaskResult(args);
        return ok("Task result recorded.");
      } catch (e) {
        return err(`recording task result: ${e}`);
      }
    }
  );

  const getPerformanceJs = tool(
    "get_performance_js",
    "Get the JavaScript snippet to evaluate in the browser for collecting performance metrics. Run the returned JS via browser_evaluate, parse the JSON result, then pass it to capture_performance.",
    {},
    async () => {
      return ok(PERFORMANCE_JS_SNIPPET);
    }
  );

  return createSdkMcpServer({
    name: "metrics",
    version: "1.0.0",
    tools: [
      recordPageVisit,
      capturePerformance,
      recordInteraction,
      recordFrustration,
      recordTaskResult,
      getPerformanceJs,
    ],
  });
}
