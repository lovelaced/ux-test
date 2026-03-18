import { EventEmitter } from "node:events";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { getPersonaDefinitions, buildPersonaPrompt } from "./personas/index.js";
import { MetricsStore } from "./metrics/index.js";
import { createMetricsCollectorServer } from "./metrics/collector.js";
import { detectFrustrationSignals } from "./metrics/frustration.js";
import { killOrphanedBrowsers } from "./utils/cleanup.js";
import { createLogger, setVerbose } from "./utils/logger.js";
import type { TestConfig, PersonaResult, TestProgressEvent } from "./types.js";
import type { PersonaDefinition } from "./personas/types.js";

const log = createLogger("orchestrator");

// Pinned version of @playwright/mcp to use via npx.
// Using npx is the standard MCP server pattern that the Agent SDK supports.
// The local npm cache ensures this doesn't re-download each time.
const PLAYWRIGHT_MCP_VERSION = "0.0.28";

function emit(progress: EventEmitter | undefined, event: TestProgressEvent) {
  progress?.emit("progress", event);
}

export async function runTest(
  config: TestConfig,
  progress?: EventEmitter
): Promise<PersonaResult[]> {
  if (config.verbose) setVerbose(true);

  const personas = getPersonaDefinitions(config.personas);
  const concurrency = config.concurrency ?? 3;
  const testStartTime = Date.now();

  log.info(
    `Starting test for ${config.url} with ${personas.length} persona(s), concurrency=${concurrency}`
  );

  emit(progress, {
    type: "test:start",
    personaCount: personas.length,
    concurrency,
  });

  const results: PersonaResult[] = [];

  // Run personas in batches to respect concurrency limit
  for (let i = 0; i < personas.length; i += concurrency) {
    const batch = personas.slice(i, i + concurrency);
    log.info(
      `Running batch ${Math.floor(i / concurrency) + 1}: ${batch.map((p) => p.id).join(", ")}`
    );

    const batchResults = await Promise.allSettled(
      batch.map((persona) => runPersonaAgent(config, persona, progress))
    );

    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j];
      if (result.status === "fulfilled") {
        results.push(result.value);
        log.info(
          `${batch[j].label}: completed (${result.value.durationMs}ms)`
        );
        emit(progress, {
          type: "persona:complete",
          personaId: batch[j].id,
          personaLabel: batch[j].label,
          durationMs: result.value.durationMs,
          tasksCompleted: result.value.tasks.filter((t) => t.completed).length,
          tasksTotal: result.value.tasks.length,
        });
      } else {
        log.error(`${batch[j].label}: failed — ${result.reason}`);
        emit(progress, {
          type: "persona:error",
          personaId: batch[j].id,
          personaLabel: batch[j].label,
          error: String(result.reason),
        });
      }
    }
  }

  // Final safety sweep: kill any orphaned browser processes
  await killOrphanedBrowsers("final-sweep");

  const wallClockMs = Date.now() - testStartTime;
  log.info(
    `Test complete. ${results.length}/${personas.length} personas succeeded in ${(wallClockMs / 1000).toFixed(0)}s`
  );

  emit(progress, {
    type: "test:complete",
    resultCount: results.length,
    totalPersonas: personas.length,
    wallClockMs,
  });

  return results;
}

/**
 * Run a single persona agent with timeout protection and cleanup.
 * On timeout or crash, orphaned browser processes are killed.
 */
async function runPersonaAgent(
  config: TestConfig,
  persona: PersonaDefinition,
  progress?: EventEmitter
): Promise<PersonaResult> {
  const timeoutMs = (config.maxTimePerPersonaSeconds ?? 300) * 1000;

  // Race the actual agent work against a timeout
  const agentPromise = runPersonaAgentInner(config, persona, progress);
  const timeoutPromise = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Persona ${persona.id} timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
    // Don't let the timer keep the process alive
    timer.unref();
  });

  try {
    return await Promise.race([agentPromise, timeoutPromise]);
  } catch (err) {
    log.error(`${persona.id}: cleaning up after failure — ${err}`);
    await killOrphanedBrowsers(persona.id);
    // Return a partial result instead of throwing, so the test continues
    return {
      personaId: persona.id,
      personaLabel: persona.label,
      sessionId: "",
      tasks: [],
      navigationPath: [],
      interactions: [],
      performanceSnapshots: [],
      frustrationSignals: [],
      agentTranscriptSummary: `Agent failed: ${err}`,
      durationMs: 0,
    };
  }
}

/**
 * Inner agent runner — does the actual work.
 */
async function runPersonaAgentInner(
  config: TestConfig,
  persona: PersonaDefinition,
  progress?: EventEmitter
): Promise<PersonaResult> {
  const personaLog = createLogger(persona.id);
  const metricsStore = new MetricsStore();
  const metricsServer = createMetricsCollectorServer(metricsStore);
  const startTime = Date.now();

  const { systemPrompt, userPrompt } = buildPersonaPrompt(persona, config);

  // Build Playwright MCP args with --isolated for ephemeral profile (no lock conflicts).
  // Omitting --browser uses Playwright's bundled Chromium (fully isolated from system Chrome).
  // Only pass --browser if user explicitly chose a non-default engine.
  const browserType = config.browserType;
  const browserArgs =
    browserType && browserType !== "chromium"
      ? ["--browser", browserType]
      : []; // default = bundled Chromium, no flag needed

  // Build allowed tools, filtering out any tools this persona must not use
  let allowedTools = ["mcp__playwright__*", "mcp__metrics__*"];
  if (persona.disallowedTools && persona.disallowedTools.length > 0) {
    allowedTools = [
      "mcp__playwright__browser_navigate",
      "mcp__playwright__browser_snapshot",
      "mcp__playwright__browser_click",
      "mcp__playwright__browser_type",
      "mcp__playwright__browser_press_key",
      "mcp__playwright__browser_evaluate",
      "mcp__playwright__browser_wait_for",
      "mcp__playwright__browser_console_messages",
      "mcp__playwright__browser_network_requests",
      "mcp__playwright__browser_tab_list",
      "mcp__playwright__browser_tab_new",
      "mcp__playwright__browser_tab_select",
      "mcp__playwright__browser_tab_close",
      "mcp__playwright__browser_select_option",
      "mcp__playwright__browser_hover",
      "mcp__playwright__browser_drag",
      "mcp__playwright__browser_handle_dialog",
      "mcp__playwright__browser_file_upload",
      "mcp__playwright__browser_pdf_save",
      "mcp__playwright__browser_close",
      "mcp__playwright__browser_install",
      "mcp__playwright__browser_resize",
      "mcp__metrics__*",
    ].filter((t) => !persona.disallowedTools!.includes(t));
  }

  personaLog.info("Starting agent...");
  emit(progress, {
    type: "persona:start",
    personaId: persona.id,
    personaLabel: persona.label,
  });

  let sessionId = "";
  let resultText = "";
  let lastAssistantText = "";  // capture last text block for narrative fallback

  try {
    for await (const message of query({
      prompt: userPrompt,
      options: {
        systemPrompt,
        model: "claude-sonnet-4-20250514",
        maxTurns: config.maxTurnsPerPersona ?? 25,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        // Disable ALL built-in tools (WebFetch, Bash, Read, etc.) so the agent
        // can ONLY use Playwright MCP + metrics MCP tools. This prevents the agent
        // from falling back to WebFetch if the browser MCP fails to connect.
        tools: [],
        mcpServers: {
          playwright: {
            command: "npx",
            args: [
              `@playwright/mcp@${PLAYWRIGHT_MCP_VERSION}`,
              ...browserArgs,
              "--headless",
              "--isolated",
              "--caps", "core",
              ...(persona.playwrightDevice ? ["--device", persona.playwrightDevice] : []),
            ],
          },
          metrics: metricsServer,
        },
        // Auto-allow all MCP tools without permission prompts
        allowedTools,
        // Log stderr from the Claude Code subprocess for debugging MCP issues
        stderr: (data: string) => {
          const trimmed = data.trim();
          if (trimmed) personaLog.debug(`stderr: ${trimmed}`);
        },
      },
    })) {
      if (message.type === "system" && message.subtype === "init") {
        sessionId = message.session_id;
        personaLog.info(`Session: ${sessionId}`);

        // Check if MCP servers connected — critical for browser access.
        // If Playwright fails to connect, abort immediately rather than
        // letting the agent run without browser tools (which produces useless results).
        const mcpServers = (message as Record<string, unknown>).mcp_servers;
        if (Array.isArray(mcpServers)) {
          let playwrightConnected = false;
          for (const srv of mcpServers as Array<{ name?: string; status?: string; error?: string }>) {
            personaLog.info(`MCP "${srv.name}": ${srv.status}${srv.error ? ` — ${srv.error}` : ""}`);
            if (srv.name === "playwright" && srv.status === "connected") {
              playwrightConnected = true;
            }
          }
          if (!playwrightConnected) {
            const errMsg = "Playwright MCP server failed to connect — aborting persona (no browser available)";
            personaLog.error(errMsg);
            throw new Error(errMsg);
          }
        }
      }

      if (message.type === "assistant") {
        for (const block of message.message.content) {
          if ("text" in block && typeof block.text === "string" && block.text.trim()) {
            // Capture the last substantive text block — this is the agent's narrative
            lastAssistantText = block.text;
          }
          if ("name" in block && typeof block.name === "string") {
            personaLog.debug(`Tool: ${block.name}`);
            emit(progress, {
              type: "persona:tool_use",
              personaId: persona.id,
              toolName: block.name,
            });
          }
        }
      }

      if (message.type === "result") {
        if (message.subtype === "success") {
          resultText = message.result;
        } else {
          personaLog.warn(`Agent ended with: ${message.subtype}`);
          if ("result" in message) resultText = String(message.result);
        }
      }
    }
  } catch (err) {
    personaLog.error(`Agent crashed: ${err}`);
    resultText = `Agent crashed: ${err}`;
  }

  // Post-processing: detect additional frustration signals
  const rawInteractions = metricsStore.getInteractions();
  const rawPageVisits = metricsStore.getPageVisits();
  const additionalSignals = detectFrustrationSignals(
    rawInteractions,
    rawPageVisits
  );

  // Finalize dwell time for last page visit
  const pageVisits = metricsStore.getPageVisits();
  if (pageVisits.length > 0) {
    const last = pageVisits[pageVisits.length - 1];
    if (last.dwellTimeMs === 0) {
      last.dwellTimeMs = Date.now() - last.timestampMs;
    }
  }

  // Merge agent-reported and post-processed frustration signals, tag with persona
  const agentSignals = metricsStore.getFrustrationSignals();
  const allSignals = deduplicateSignals([...agentSignals, ...additionalSignals])
    .map((s) => ({ ...s, personaId: persona.id }));

  return {
    personaId: persona.id,
    personaLabel: persona.label,
    sessionId,
    tasks: metricsStore.getTaskResults(),
    navigationPath: pageVisits,
    interactions: rawInteractions,
    performanceSnapshots: metricsStore.getPerformanceSnapshots(),
    frustrationSignals: allSignals,
    agentTranscriptSummary: resultText || lastAssistantText,
    durationMs: Date.now() - startTime,
  };
}

function deduplicateSignals(
  signals: PersonaResult["frustrationSignals"]
): PersonaResult["frustrationSignals"] {
  const seen = new Set<string>();
  return signals.filter((s) => {
    const bucket = Math.floor(s.timestampMs / 2000);
    const key = `${s.type}:${s.url}:${bucket}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
