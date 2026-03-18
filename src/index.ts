#!/usr/bin/env node

import { Command } from "commander";
import { loadConfig } from "./config.js";
import { runTest } from "./orchestrator.js";
import { generateReport } from "./reporting/index.js";
import { PERSONA_DEFINITIONS } from "./personas/definitions.js";
import { setVerbose } from "./utils/logger.js";

const program = new Command()
  .name("ux-test")
  .description("Synthetic user testing powered by Claude AI")
  .version("0.1.0");

program
  .command("run")
  .description("Run synthetic user tests against a URL")
  .requiredOption("-u, --url <url>", "Target URL to test")
  .option("-t, --task <tasks...>", "Task descriptions (can specify multiple)")
  .option(
    "-p, --personas <personas...>",
    "Persona IDs to use (default: all). Use 'list-personas' to see options"
  )
  .option("-c, --concurrency <number>", "Max parallel agents", "3")
  .option("--max-turns <number>", "Max turns per persona agent", "25")
  .option("--headless", "Run browsers in headless mode (default: true)")
  .option("--no-headless", "Run browsers in headed mode (visible)")
  .option("--browser <type>", "Browser type: chrome, firefox, webkit", "chrome")
  .option("--viewport <size>", "Viewport size WxH", "1280x720")
  .option("-o, --output <dir>", "Output directory", "./results")
  .option(
    "-f, --format <formats...>",
    "Output formats: json, markdown, html",
    ["json", "markdown"]
  )
  .option("--config <path>", "Path to config file")
  .option("--verbose", "Enable verbose logging")
  .action(async (opts) => {
    try {
      if (opts.verbose) setVerbose(true);

      const config = loadConfig(opts);
      console.log(
        `\nStarting UX test for ${config.url} with ${config.personas?.length ?? PERSONA_DEFINITIONS.length} persona(s)...\n`
      );

      const results = await runTest(config);
      const report = generateReport(results, config);

      // Exit with non-zero if critical issues found
      const criticalCount = report.issuesList.filter(
        (i) => i.severity === "critical"
      ).length;
      if (criticalCount > 0) {
        console.log(
          `\nExiting with code 1: ${criticalCount} critical issue(s) found.`
        );
        process.exit(1);
      }
    } catch (err) {
      console.error("Fatal error:", err);
      process.exit(2);
    }
  });

program
  .command("list-personas")
  .description("List available persona definitions")
  .action(() => {
    console.log("\nAvailable Personas:\n");
    console.log(
      "ID".padEnd(30) +
        "Label".padEnd(25) +
        "Tech".padEnd(15) +
        "Behavior".padEnd(18) +
        "Device"
    );
    console.log("-".repeat(100));

    for (const persona of PERSONA_DEFINITIONS) {
      console.log(
        persona.id.padEnd(30) +
          persona.label.padEnd(25) +
          persona.techProficiency.padEnd(15) +
          persona.browseBehavior.padEnd(18) +
          persona.deviceType
      );
    }

    console.log(
      `\nUse --personas <id1> <id2> to select specific personas.\n`
    );
  });

program.parse();
