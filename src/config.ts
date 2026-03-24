import { z } from "zod";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_CONFIG, type TestConfig, type PersonaId } from "./types.js";

const PERSONA_IDS: PersonaId[] = [
  "novice-goal-directed",
  "novice-explorer",
  "intermediate-goal-directed",
  "power-user",
  "impatient-scanner",
  "keyboard-only",
  "screen-reader",
  "search-first",
  "mobile-novice",
  "mobile-power",
  "mobile-technical",
  "mobile-commuter",
  "mobile-elderly",
  "mobile-multitasker",
  "visual-design-critic",
  "interface-design-evaluator",
  "design-consistency-auditor",
  "motion-animation-evaluator",
  "typography-color-critic",
];

const TaskSchema = z.object({
  id: z.string(),
  description: z.string(),
  successCriteria: z.string().optional(),
  maxTimeSeconds: z.number().positive().optional(),
});

const ThresholdSchema = z.object({
  maxLCP: z.number().positive().optional(),
  maxCLS: z.number().positive().optional(),
  maxTBT: z.number().positive().optional(),
  maxTaskTimeSeconds: z.number().positive().optional(),
  minTaskCompletionRate: z.number().min(0).max(1).optional(),
});

const AuthSchema = z.object({
  username: z.string().optional(),
  password: z.string().optional(),
  cookies: z
    .array(
      z.object({
        name: z.string(),
        value: z.string(),
        domain: z.string(),
      })
    )
    .optional(),
});

const ConfigSchema = z.object({
  url: z.string().url(),
  tasks: z.array(TaskSchema).optional(),
  personas: z.array(z.enum(PERSONA_IDS as [PersonaId, ...PersonaId[]])).optional(),
  concurrency: z.number().int().positive().optional(),
  maxTurnsPerPersona: z.number().int().positive().optional(),
  maxTimePerPersonaSeconds: z.number().int().positive().optional(),
  headless: z.boolean().optional(),
  browserType: z.enum(["chromium", "chrome", "firefox", "webkit"]).optional(),
  viewportSize: z.object({ width: z.number(), height: z.number() }).optional(),
  outputDir: z.string().optional(),
  outputFormat: z.array(z.enum(["json", "markdown", "html"])).optional(),
  verbose: z.boolean().optional(),
  auth: AuthSchema.optional(),
  thresholds: ThresholdSchema.optional(),
});

function loadConfigFile(): Partial<TestConfig> {
  const configPath = resolve("ux-test.config.json");
  if (!existsSync(configPath)) return {};
  const raw = JSON.parse(readFileSync(configPath, "utf-8"));
  return ConfigSchema.partial().parse(raw);
}

export function loadConfig(cliOpts: Record<string, unknown>): TestConfig {
  const fileConfig = cliOpts.config
    ? JSON.parse(readFileSync(String(cliOpts.config), "utf-8"))
    : loadConfigFile();

  // Parse viewport from "WxH" string
  let viewportSize: { width: number; height: number } | undefined;
  if (typeof cliOpts.viewport === "string") {
    const [w, h] = cliOpts.viewport.split("x").map(Number);
    if (w && h) viewportSize = { width: w, height: h };
  }

  // Parse tasks from CLI --task flags
  const tasks =
    Array.isArray(cliOpts.task) && cliOpts.task.length > 0
      ? cliOpts.task.map((desc: string, i: number) => ({
          id: `task-${i + 1}`,
          description: desc,
        }))
      : undefined;

  const merged: Record<string, unknown> = {
    ...DEFAULT_CONFIG,
    ...(fileConfig as Record<string, unknown>),
    url: (cliOpts.url as string) ?? (fileConfig as TestConfig).url,
  };

  if (tasks) merged.tasks = tasks;
  if (cliOpts.personas) merged.personas = cliOpts.personas;
  if (cliOpts.concurrency) merged.concurrency = Number(cliOpts.concurrency);
  if (cliOpts.maxTurns) merged.maxTurnsPerPersona = Number(cliOpts.maxTurns);
  if (viewportSize) merged.viewportSize = viewportSize;
  if (cliOpts.output) merged.outputDir = cliOpts.output;
  if (cliOpts.format) merged.outputFormat = cliOpts.format;
  if (cliOpts.browser) merged.browserType = cliOpts.browser;
  if (cliOpts.verbose !== undefined) merged.verbose = Boolean(cliOpts.verbose);
  if (cliOpts.headless !== undefined) merged.headless = Boolean(cliOpts.headless);

  return ConfigSchema.parse(merged);
}

export function validateConfig(raw: unknown): TestConfig {
  return ConfigSchema.parse(raw);
}
