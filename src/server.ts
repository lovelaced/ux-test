import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { runTest } from "./orchestrator.js";
import { aggregateResults } from "./reporting/aggregator.js";
import { validateConfig } from "./config.js";
import { PERSONA_DEFINITIONS } from "./personas/definitions.js";
import { killOrphanedBrowsers } from "./utils/cleanup.js";
import { DEFAULT_CONFIG } from "./types.js";
import type { AggregatedReport } from "./reporting/types.js";
import type { TestProgressEvent } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve UI path — works from both src/ (tsx) and dist/ (compiled)
function resolveUiPath(): string {
  const candidates = [
    join(__dirname, "ui", "index.html"),           // tsx: src/ui/index.html
    join(__dirname, "..", "src", "ui", "index.html"), // compiled: dist/../src/ui/index.html
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(`Could not find index.html. Checked: ${candidates.join(", ")}`);
}

interface ActiveTest {
  emitter: EventEmitter;
  status: "running" | "complete" | "error";
  report: AggregatedReport | null;
  events: TestProgressEvent[];
  error?: string;
  createdAt: number;
}

const activeTests = new Map<string, ActiveTest>();

// Cleanup completed tests after 30 minutes
const CLEANUP_TTL_MS = 30 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [id, test] of activeTests) {
    if (test.status !== "running" && test.createdAt && now - test.createdAt > CLEANUP_TTL_MS) {
      activeTests.delete(id);
    }
  }
}, 60_000);

const MAX_BODY_BYTES = 64 * 1024; // 64KB limit

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error("Request body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

function json(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data));
}

function cors(res: ServerResponse) {
  res.writeHead(204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end();
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const path = url.pathname;

  if (req.method === "OPTIONS") {
    cors(res);
    return;
  }

  try {
    // Serve UI
    if (path === "/" && req.method === "GET") {
      const html = readFileSync(resolveUiPath(), "utf-8");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
      return;
    }

    // Get persona definitions
    if (path === "/api/personas" && req.method === "GET") {
      json(res, PERSONA_DEFINITIONS);
      return;
    }

    // Get defaults
    if (path === "/api/defaults" && req.method === "GET") {
      json(res, DEFAULT_CONFIG);
      return;
    }

    // Start a test
    if (path === "/api/test/start" && req.method === "POST") {
      const body = JSON.parse(await readBody(req));
      const config = validateConfig(body);

      const testId = randomUUID();
      const emitter = new EventEmitter();
      const test: ActiveTest = {
        emitter,
        status: "running",
        report: null,
        events: [],
        createdAt: Date.now(),
      };
      activeTests.set(testId, test);

      // Record all events for replay on reconnect
      emitter.on("progress", (event: TestProgressEvent) => {
        test.events.push(event);
      });

      // Run test in background
      const testStart = Date.now();
      runTest(config, emitter)
        .then((results) => {
          try {
            const report = aggregateResults(results, config, Date.now() - testStart);
            test.report = report;
            test.status = "complete";
          } catch (aggErr) {
            console.error("Report aggregation failed:", aggErr);
            test.status = "error";
            test.error = `Report generation failed: ${aggErr}`;
          }
          // Always emit report:ready so the UI can show whatever we have
          emitter.emit("progress", { type: "report:ready" } satisfies TestProgressEvent);
        })
        .catch((err) => {
          test.status = "error";
          test.error = String(err);
          emitter.emit("progress", {
            type: "test:error",
            error: String(err),
          } satisfies TestProgressEvent);
          // Still emit report:ready so user can at least see the error
          emitter.emit("progress", { type: "report:ready" } satisfies TestProgressEvent);
        });

      json(res, { testId });
      return;
    }

    // SSE event stream
    const eventsMatch = path.match(/^\/api\/test\/([^/]+)\/events$/);
    if (eventsMatch && req.method === "GET") {
      const testId = eventsMatch[1];
      const test = activeTests.get(testId);
      if (!test) {
        json(res, { error: "Test not found" }, 404);
        return;
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });

      // Replay past events
      for (const event of test.events) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }

      // Stream new events
      const handler = (event: TestProgressEvent) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      };
      test.emitter.on("progress", handler);
      req.on("close", () => test.emitter.off("progress", handler));
      return;
    }

    // Get report
    const reportMatch = path.match(/^\/api\/test\/([^/]+)\/report$/);
    if (reportMatch && req.method === "GET") {
      const testId = reportMatch[1];
      const test = activeTests.get(testId);
      if (!test) {
        json(res, { error: "Test not found" }, 404);
        return;
      }
      if (!test.report) {
        if (test.status === "error") {
          json(res, { error: test.error ?? "Test failed — no report generated" }, 500);
        } else {
          json(res, { error: "Report not ready yet" }, 202);
        }
        return;
      }
      json(res, test.report);
      return;
    }

    // 404
    json(res, { error: "Not found" }, 404);
  } catch (err) {
    console.error("Server error:", err);
    json(res, { error: String(err) }, 500);
  }
});

const PORT = parseInt(process.env.PORT ?? "3847", 10);

// Graceful shutdown: clean up any orphaned browser processes
async function shutdown(signal: string) {
  console.log(`\n${signal} received — cleaning up browser processes...`);
  await killOrphanedBrowsers("shutdown");
  server.close();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  shutdown("uncaughtException");
});

server.listen(PORT, () => {
  console.log(`
  ┌─────────────────────────────────────────────┐
  │                                             │
  │   UX Test — Synthetic User Testing Suite    │
  │                                             │
  │   Running at: http://localhost:${PORT}        │
  │                                             │
  │   Uses your Claude Code auth — no API key   │
  │   needed. Just make sure you're logged in:  │
  │   Run 'claude' to verify.                   │
  │                                             │
  └─────────────────────────────────────────────┘
`);
});
