import type { PersonaId } from "../types.js";

export interface PersonaDefinition {
  id: PersonaId;
  label: string;
  techProficiency: "novice" | "intermediate" | "power";
  browseBehavior: "goal-directed" | "exploratory";
  patience: "impatient" | "normal" | "patient";
  readingStyle: "scanner" | "reader";
  navigationStrategy: "visual" | "search-first" | "menu-first" | "keyboard";
  accessibilityMode?: "keyboard-only" | "screen-reader";
  deviceType: "desktop" | "mobile";
  viewportOverride?: { width: number; height: number };
  playwrightDevice?: string;
  maxRetries: number;
  maxTaskAttempts: number;
  disallowedTools?: string[];
  traits: string[];
}
