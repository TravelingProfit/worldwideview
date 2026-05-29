---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: full-mcp-support
status: active
last_updated: "2026-05-29T11:24:00.000Z"
progress:
  total_phases: 6
  completed_phases: 1
  total_plans: 7
  completed_plans: 5
  percent: 17
---

# Project State

## Project Reference

Isolated planning workspace for the **v1.2 Full MCP Support** milestone (Phases 16-21).
Split out of the shared root `C:\dev\wwv\.planning` on 2026-05-29 because v1.1 (marketplace
auth gate) and v1.2 (MCP server) were tangled in one ROADMAP/REQUIREMENTS with no shared
phases or dependency.

Primary repo: this worktree (`worldwideview`, branch `feat/mcp-support`).
Cross-repo deps declared in ROADMAP.md: Phase 20 -> wwv-data-engine REST; Phase 21 ->
wwv-data-engine + `@worldwideview/wwv-plugin-sdk` + marketplace JWT bridge.

Cross-feature docs (MILESTONES.md, the plugin-pipeline backlogs) stay at the shared root and
are NOT duplicated here.

## Current Position

Phase: 17 (MCP Server Foundation) — IN PROGRESS (3 plans; Wave 0 complete)
- **17-01 DONE (fcb7a5e):** RED test scaffolds (route.test.ts + transport-spike.test.ts). route.test.ts
  is RED (./route absent); spike passes/skips cleanly.
- **17-02 NEXT:** Install @modelcontextprotocol/sdk@^1.29.0, implement route.ts + createMcpServer factory.
- **17-03:** ConnectAgentHelper UI + Nginx runbook + semver bump 2.26.0.

## Phase 17 Plan Map (planned 2026-05-29)

- **17-01 (Wave 0, autonomous):** RED test scaffolds for /api/mcp (401 JSON-RPC, 403 demo gate,
  stateless per-request construction, X-Accel-Buffering header) + a raw-SDK transport runtime spike
  that proves WebStandardStreamableHTTPServerTransport + McpServer instantiate/connect outside a
  custom server (or flags a blocker). Covers MCP-01..04.

- **17-02 (Wave 1, autonomous + blocking-human SDK-legitimacy checkpoint):** `pnpm add
  @modelcontextprotocol/sdk@^1.29.0`, `src/lib/mcp/server.ts` createMcpServer() factory (empty
  capabilities), and the gated stateless `src/app/api/mcp/route.ts` (isDemo-first 403, Bearer 401
  via Phase 16 authenticateApiKey, fresh server+transport per request, X-Accel-Buffering: no). Turns
  Wave 0 green. Covers MCP-01..04.

- **17-03 (Wave 2, autonomous + human-verify checkpoint):** `ConnectAgentHelper.tsx` (per-edition
  URL + mcpServers JSON with Bearer header for Desktop/Cursor/VS Code + Manual block + agent prompt;
  Claude Code CLI deferred as "coming soon"), mounted where the Phase 16 TODO placeholder was;
  `.agents/context/server-management.md` Coolify/Nginx streaming runbook (documented, not automated);
  semver bump 2.25.0 -> 2.26.0. Covers CONNECT-01/02/03.

## Key Decisions

- **17 transport decision (LOCKED, BATCH-DECISIONS-17-21.md + 17-CONTEXT.md):** raw
  `@modelcontextprotocol/sdk@^1.29.0` (NOT mcp-handler) + the SDK's
  `WebStandardStreamableHTTPServerTransport` (`@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js`)
  inside a Next 16 App Router route handler at `src/app/api/mcp/route.ts`. **Confirmed against the
  published SDK 1.29.0 types**: `handleRequest(req: Request): Promise<Response>` is Web-Standard and
  documented for Hono/Cloudflare-Workers fetch handlers — identical Request/Response shape to a Next 16
  route handler. NO custom `server.ts` is needed in Phase 17 (that is a Phase 19 / WebSocket artifact).
  NO BLOCKER. A Wave 0 spike re-confirms at runtime and escalates only if the transport genuinely
  cannot run in a route handler.

- **17 stateless (D-17-04):** fresh McpServer + transport per request (sessionIdGenerator: undefined),
  never cached at module scope, with a guard-rail comment. No tools/resources registered this phase.

- **17 auth (D-17-03):** reuse Phase 16 `authenticateApiKey()` unchanged; 401 JSON-RPC body
  `{ jsonrpc:"2.0", error:{ code:-32600, message:"Unauthorized" }, id:null }`. Demo -> 403, gate FIRST.

- **17 connect helper (D-17-08/09):** in "API & MCP Access"; mcpServers JSON carries the token in the
  Authorization HEADER (raw-SDK Streamable HTTP form), never in a URL; Claude Code CLI deferred "coming
  soon". Nginx/Coolify buffering documented (D-17-07), not automated.

- **17-01 (Wave 0):** @vite-ignore on variable-based import specifier required in transport spike to
  prevent Vite's import-analysis from crashing at transform time on absent SDK. Runtime try/catch alone
  is insufficient because Vite resolves import() specifiers statically before test execution.
  SDK vi.mock factories (no real module) work correctly for route.test.ts stateless-construction tests.

- **16-01 (Wave 0):** Three RED test files lock api-key contracts (token format, timing oracle T-16-01,
  max-3, ownership-scoped delete) before any implementation. timing-oracle test tagged `// [slow]`.

- **16-02 (Wave 1):** UserApiKey Prisma model + apiKeyAuth.ts helper. DUMMY_HASH pre-baked literal
  eliminates cold-start timing oracle gap; async bcrypt compare always runs on miss (T-16-01). All
  helper tests GREEN.

- **16-03 (Wave 2):** isDemo gate runs FIRST (before auth()). deleteMany ownership-scoped delete
  eliminates TOCTOU (T-16-06). fullToken returned once in POST 201; GET omits hashedSecret (T-16-07).

- **16-04 (Wave 3):** PersonalApiKeysSection UI shipped in the renamed "Keys & Access" modal; version
  bumped to 2.25.0; Phase 17 connect-helper placeholder comment left at ~L347.

- v1.2 QA requirement IDs renamed `QA-01/02/03` -> `MCP-QA-01/02/03` to resolve a v1.1 collision.
- One primary worktree for the whole milestone; data-engine / SDK / marketplace are declared cross-repo
  dependencies, not separate planning roots.

- **Scope expansion (2026-05-29, user-approved):** keys are generic transport-agnostic API keys (req
  API-01); one reusable `authenticateApiKey()` middleware; capabilities as a shared service layer
  wrapped by MCP + future REST (`/api/v1/*`, Phases 20/21). CLI deferred to a future milestone.

## Blockers

None. (Phase 17 transport-in-route-handler question resolved: confirmed viable, no custom server.ts.)
