import { execSync } from "node:child_process";
import { createLogger } from "./logger.js";

const log = createLogger("cleanup");

/**
 * Find and kill orphaned Chromium/Playwright processes that may have been
 * left behind by crashed or timed-out agent sessions.
 *
 * On macOS/Linux, uses pgrep to find processes matching known Playwright
 * browser patterns, then sends SIGTERM (graceful) followed by SIGKILL
 * (forced) if needed.
 */
export async function killOrphanedBrowsers(label?: string): Promise<number> {
  const prefix = label ? `[${label}] ` : "";
  let killed = 0;

  // Patterns that match Playwright-spawned browser processes
  const patterns = [
    "chromium.*--headless.*--remote-debugging",
    "chrome.*--headless.*--remote-debugging",
    "playwright.*mcp",
  ];

  for (const pattern of patterns) {
    try {
      const output = execSync(`pgrep -f "${pattern}" 2>/dev/null`, {
        encoding: "utf-8",
        timeout: 5000,
      }).trim();

      if (!output) continue;

      const pids = output
        .split("\n")
        .map((p) => parseInt(p.trim(), 10))
        .filter((p) => !isNaN(p) && p !== process.pid);

      for (const pid of pids) {
        try {
          // First try graceful shutdown
          process.kill(pid, "SIGTERM");
          killed++;
          log.info(`${prefix}Sent SIGTERM to PID ${pid}`);
        } catch {
          // Process may have already exited
        }
      }
    } catch {
      // pgrep returns non-zero when no processes match — this is normal
    }
  }

  // If we sent any SIGTERMs, wait briefly then force-kill any survivors
  if (killed > 0) {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    for (const pattern of patterns) {
      try {
        const output = execSync(`pgrep -f "${pattern}" 2>/dev/null`, {
          encoding: "utf-8",
          timeout: 5000,
        }).trim();

        if (!output) continue;

        const pids = output
          .split("\n")
          .map((p) => parseInt(p.trim(), 10))
          .filter((p) => !isNaN(p) && p !== process.pid);

        for (const pid of pids) {
          try {
            process.kill(pid, "SIGKILL");
            log.info(`${prefix}Sent SIGKILL to PID ${pid}`);
          } catch {
            // Already exited
          }
        }
      } catch {
        // No matching processes
      }
    }
  }

  if (killed > 0) {
    log.info(`${prefix}Cleaned up ${killed} orphaned browser process(es)`);
  }

  return killed;
}
