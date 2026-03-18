# Synthetic User Testing Suite

## Project Overview
TypeScript tool using the Claude Agent SDK to run automated synthetic user tests against arbitrary web applications. Each "persona" (novice, power user, keyboard-only, mobile, etc.) runs as an independent Claude agent with its own Playwright MCP browser instance, exploring the target site and collecting UX metrics.

## Architecture
- `src/orchestrator.ts` — Launches parallel persona agents via independent `query()` calls
- `src/server.ts` — HTTP server with SSE for the web UI
- `src/ui/index.html` — Single-page web interface (no framework, vanilla JS)
- `src/personas/` — Persona definitions that become system prompts
- `src/metrics/collector.ts` — SDK MCP server exposing metric-recording tools to agents
- `src/metrics/frustration.ts` — Post-processing frustration signal detection
- `src/reporting/` — Aggregates results across personas into severity-ranked reports

## Key Patterns
- Each persona runs as a separate `query()` call (not a subagent) so it gets its own Playwright MCP instance
- Metrics collection uses an in-process SDK MCP server (`createSdkMcpServer`) per persona
- The MetricsStore is shared via closure between the MCP server and the orchestrator
- `bypassPermissions` mode is required since there is no human to approve browser actions
- Post-processing frustration detection catches signals the agent missed
- The orchestrator emits progress events via EventEmitter, piped to the UI via SSE

## Commands
- `npm run ui` — Launch the web UI at http://localhost:3847
- `npm run build` — Compile TypeScript
- `npm run dev -- run --url https://example.com` — Run tests via CLI
- `npm run dev -- list-personas` — Show available personas
- `npm test` — Run tests with vitest

## Authentication
Uses Claude Code OAuth — no API key needed. The Agent SDK spawns the `claude` CLI binary which inherits the user's existing Claude Code login. Users just need to:
1. Install Claude Code: `npm install -g @anthropic-ai/claude-code`
2. Run `claude` once to complete OAuth login
3. Then run `npm run ui`

## Dependencies
- `@anthropic-ai/claude-agent-sdk` — Claude Agent SDK for TypeScript
- `@playwright/mcp` — Playwright MCP server (invoked via npx, not a direct dependency)
- `commander` — CLI argument parsing
- `zod` — Schema validation

## Environment
- Node.js 20+ required
- npx must be available (for Playwright MCP server spawning)
- Claude Code must be installed and authenticated
