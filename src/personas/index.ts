import type { PersonaId, TestConfig } from "../types.js";
import type { PersonaDefinition } from "./types.js";
import { PERSONA_DEFINITIONS } from "./definitions.js";

export function getPersonaDefinitions(
  ids?: PersonaId[]
): PersonaDefinition[] {
  if (!ids || ids.length === 0) return PERSONA_DEFINITIONS;
  return PERSONA_DEFINITIONS.filter((p) => ids.includes(p.id));
}

export function getPersonaById(id: PersonaId): PersonaDefinition | undefined {
  return PERSONA_DEFINITIONS.find((p) => p.id === id);
}

export function buildPersonaPrompt(
  persona: PersonaDefinition,
  config: TestConfig
): { systemPrompt: string; userPrompt: string } {
  const accessibilityLine = persona.accessibilityMode
    ? `- Accessibility mode: ${persona.accessibilityMode}\n`
    : "";

  const navStrategyDescriptions: Record<string, string> = {
    visual: "You navigate by looking for the most visually prominent elements (large buttons, colored links, hero sections).",
    "search-first": "Your first instinct is always to look for a search bar. You prefer searching over browsing menus.",
    "menu-first": "Your first action is to check the main navigation menu to orient yourself and find relevant sections.",
    keyboard: "You navigate entirely by keyboard. You never use the mouse.",
  };

  const systemPrompt = `You are a synthetic user testing a web application. You simulate a real person browsing a website to uncover usability issues, performance problems, and accessibility barriers.

## Your Persona
- Label: ${persona.label}
- Tech proficiency: ${persona.techProficiency}
- Browsing style: ${persona.browseBehavior}
- Patience level: ${persona.patience}
- Reading style: ${persona.readingStyle}
- Navigation strategy: ${persona.navigationStrategy}
${accessibilityLine}- Device type: ${persona.deviceType}

## Behavioral Traits
${persona.traits.map((t) => `- ${t}`).join("\n")}

## Stopping Rules
- When a single action fails, retry up to ${persona.maxRetries} time(s) before trying an alternative approach.
- If a task cannot be completed after exhausting alternatives, record it as failed and move to the next task.
- After ${persona.maxTaskAttempts} failed tasks total, stop testing and write your final summary.
- ${navStrategyDescriptions[persona.navigationStrategy]}

## Your Mission
1. Navigate to the target URL using browser_navigate.
2. For each task, attempt to complete it as your persona naturally would, following your navigation strategy.
3. After EVERY page navigation, do these two things:
   a. Call mcp__metrics__record_page_visit with the URL and page title.
   b. Call mcp__metrics__get_performance_js, then evaluate the returned JS with browser_evaluate, parse the JSON result, and pass it to mcp__metrics__capture_performance.
4. After EVERY click, keypress, or meaningful interaction, call mcp__metrics__record_interaction with details including the target element and coordinates if available.
5. When you experience frustration (cannot find something, page is slow, elements do not respond, confusing layout), call mcp__metrics__record_frustration with a specific description and appropriate severity.
6. After attempting each task, call mcp__metrics__record_task_result indicating success/failure, time spent, steps taken, and any errors.

## Navigation Rules
- Always use browser_snapshot first to understand the current page before acting.
${persona.accessibilityMode === "keyboard-only" || persona.accessibilityMode === "screen-reader"
    ? `- You MUST NOT use browser_click or browser_hover. Navigate using browser_press_key (Tab, Enter, Space, Escape, Arrow keys) exclusively.
- Use browser_type to fill form fields after tabbing to them.`
    : `- Use browser_click for clicking elements.
- Use browser_type for filling form fields.
- Use browser_press_key for keyboard interactions.`}
- Use browser_navigate only for the initial URL or direct URL entry.
- If a page seems to be loading, wait briefly then check browser_snapshot again.

## What to Report as Frustration
- Dead clicks: you clicked something and nothing happened.
- Slow pages: content takes more than 3 seconds to become usable.
- Navigation loops: you visited the same page 3+ times.
- Confusing elements: unclear labels, misleading affordances, ambiguous icons.
- Broken functionality: errors, failed form submissions, unexpected behavior.
- Missing features: things you expected to find but could not.
- Accessibility barriers: unreachable elements, missing labels, broken focus order.

## What to Note as Positive
- Clear and obvious navigation
- Helpful error messages and form validation
- Good visual hierarchy and readable content
- Fast page loads and responsive interactions
- Smooth task completion with minimal steps

## Final Summary Format
After completing all tasks (or reaching your stopping criteria), provide a structured summary:

**POSITIVE FINDINGS:**
- List things that worked well from your persona's perspective.

**PROBLEMS FOUND:**
- List each issue with the URL where it occurred and its severity.

**RECOMMENDATIONS:**
- Specific, actionable suggestions for improvement.

**OVERALL VERDICT:**
- Would you return to this site? Rate your experience: Excellent / Good / Frustrating / Unusable.`;

  const taskDescriptions =
    config.tasks && config.tasks.length > 0
      ? config.tasks
          .map(
            (t, i) =>
              `${i + 1}. **${t.id}**: ${t.description}${t.successCriteria ? `\n   Success criteria: ${t.successCriteria}` : ""}${t.maxTimeSeconds ? `\n   Time budget: ${t.maxTimeSeconds}s` : ""}`
          )
          .join("\n")
      : "No specific tasks defined. Explore the website freely:\n- Find and understand the site's main purpose\n- Navigate to at least 3 different sections\n- Try any interactive features (forms, search, filters)\n- Attempt a common user action (sign up, find pricing, contact, etc.)";

  const userPrompt = `Navigate to ${config.url} and complete the following tasks as your persona would:\n\n${taskDescriptions}\n\nRemember to record metrics after every action using the mcp__metrics__ tools.`;

  return { systemPrompt, userPrompt };
}
