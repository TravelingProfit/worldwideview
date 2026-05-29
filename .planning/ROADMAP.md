# Roadmap: Full MCP Support (v1.2)

> **Planning home:** This is the isolated planning for the **v1.2 Full MCP Support** milestone,
> living in the `feat/mcp-support` worktree of `worldwideview`. It was split out of the shared
> root `C:\dev\wwv\.planning\ROADMAP.md` on 2026-05-29 (that file now holds v1.1 only).
> Combined pre-split original: `C:\dev\wwv\.planning\archive\pre-split-2026-05-29\ROADMAP.combined.md`.
>
> **QA ID note:** the v1.2 quality requirements were renamed `QA-01/02/03` -> `MCP-QA-01/02/03`
> during the split, to resolve a collision with v1.1's own `QA-01/02/03`.

## Milestone

- v1.2 **Full MCP Support** - Phases 16-21 (greenfield; no v1.2 code exists yet as of 2026-05-29)

**Primary repo:** `worldwideview` (this worktree).
**Cross-repo dependencies (declared, not separate planning roots):**
- **Phase 20** delegates entity queries to `wwv-data-engine` REST endpoints.
- **Phase 21** depends on `wwv-data-engine` REST (plugin tool delegation), the `@worldwideview/wwv-plugin-sdk` package (manifest `mcpTools` extension), and the existing `worldwideview-marketplace` JWT install bridge (for `list_plugins` / `install_plugin`).

## Phases

- [ ] **Phase 16: API Key Auth Foundation** - generic transport-agnostic API keys: UserApiKey DB model, bcrypt prefix-hash storage, reusable `authenticateApiKey()` middleware, "Keys & Access" modal key CRUD + reveal-once UI
- [ ] **Phase 17: MCP Server Foundation** - raw `@modelcontextprotocol/sdk` Streamable HTTP endpoint in a Next 16 route handler, Bearer auth gate, stateless operation, Coolify/Nginx runbook, + "Connect your agent" helper (per-client config + prompt template)
- [ ] **Phase 18: Globe State Sync + Sessions** - useGlobeStatePush hook, heartbeat, globe://state and globe://sessions resources
- [ ] **Phase 19: Globe Command Bridge** - WebSocket relay, useGlobeCommandBridge hook, per-session Redis pub/sub routing
- [ ] **Phase 20: Data Query Tools** - search_entities, get_entities_in_region, get_entity_details, get_plugin_data (parallel with Phase 19)
- [ ] **Phase 21: Plugin-Contributed Tools + Quality** - SDK manifest extension, auto-namespace, plugin bridge, dynamic tool list, tests, README

## Phase Details

### Phase 16: API Key Auth Foundation
**Goal**: Users can generate, view, and revoke generic personal API keys; keys are stored securely and a reusable `authenticateApiKey()` middleware is ready for Phase 17 (MCP) and future REST routes
**Depends on**: Nothing (first phase of v1.2)
**Target repo**: worldwideview ("Keys & Access" modal section + Prisma `UserApiKey` model + auth middleware)
**Requirements**: KEY-01, KEY-02, KEY-03, KEY-04, API-01 (middleware portion)
**Architecture note**: keys are **transport-agnostic** (not MCP-only); the auth middleware is reusable; capabilities are a shared service layer wrapped thinly by MCP/REST. The per-client "Connect your agent" helper is **Phase 17** (needs the live `/api/mcp` URL); Phase 16 ships only the key + the "API & MCP Access" section shell.
**Success Criteria** (what must be TRUE):
  1. User clicks "Generate API Key" in the "Keys & Access" modal and sees the full combined `wwv_<prefix>.<secret>` token exactly once in a copyable field with a "won't see this again" warning
  2. Key is stored as `{prefix}.{bcrypt(secret, cost=12)}`; lookup by prefix; a dummy bcrypt compare runs even when prefix is not found (timing oracle prevention)
  3. User can view active keys (name, created, last used) and revoke any -- revoked (hard-deleted) key returns 401 immediately on next request
  4. Attempting to generate a 4th key returns a clear error; max 3 enforced in the create route AND the UI
  5. `authenticateApiKey(request)` exists as a standalone, transport-neutral helper (importable by any future route), with `lastUsedAt` updated best-effort/throttled on success
**Plans**: 4 plans (4 waves)
  - [x] 16-01-PLAN.md — Wave 0 RED test scaffolds (helper + route tests) — COMPLETE 2026-05-29
  - [x] 16-02-PLAN.md — UserApiKey schema + db push + timing-safe apiKeyAuth.ts helper
  - [x] 16-03-PLAN.md — /api/api-keys CRUD routes (list, create max-3, ownership-scoped revoke)
  - [ ] 16-04-PLAN.md — PersonalApiKeysSection UI + Header 'Keys & Access' wiring + semver bump

### Phase 17: MCP Server Foundation
**Goal**: A valid Streamable HTTP MCP endpoint is live, authenticated, stateless, confirmed streaming in production, AND users can connect their AI client in one copy-paste step
**Depends on**: Phase 16
**Target repo**: worldwideview (+ Coolify/Nginx infra config)
**Requirements**: MCP-01, MCP-02, MCP-03, MCP-04, CONNECT-01, CONNECT-02, CONNECT-03
**Success Criteria** (what must be TRUE):
  1. Claude Code connects to `/api/mcp` with a valid Bearer key and receives a handshake with `protocolVersion`, `serverInfo`, and the full tools/resources list
  2. An unauthenticated request returns HTTP 401 with a JSON-RPC 2.0 error shape
  3. No `McpServer` instance is cached between requests -- each request creates a fresh one (stateless confirmed)
  4. The Coolify Nginx config includes `X-Accel-Buffering: no` and extended `proxy_read_timeout`; a 60-second streaming connection holds open without disconnect
  5. The "API & MCP Access" section renders a per-client connection helper (Claude Desktop / Cursor / VS Code `mcpServers` JSON with Bearer header; generic Manual block; Claude Code CLI deferred as "coming soon") + a copy-paste "prompt for your agent"; the secret never appears in a URL/deep-link query
**Library decision**: raw `@modelcontextprotocol/sdk@^1.29.0` (NOT mcp-handler) + the SDK's `WebStandardStreamableHTTPServerTransport` inside a Next 16 App Router route handler — confirmed against SDK 1.29.0 published types, NO custom server.ts needed in Phase 17 (per `BATCH-DECISIONS-17-21.md` / `17-CONTEXT.md`).
**Plans**: 3 plans (3 waves)
  - [x] 17-01-PLAN.md — Wave 0: RED test scaffolds (route auth/edition/stateless/streaming-header tests) + raw-SDK transport runtime spike
  - [ ] 17-02-PLAN.md — Wave 1: install SDK + createMcpServer() factory + gated stateless /api/mcp route handler (turns Wave 0 green)
  - [ ] 17-03-PLAN.md — Wave 2: ConnectAgentHelper UI (per-client config + prompt) + Coolify/Nginx runbook + semver bump to 2.26.0

### Phase 18: Globe State Sync + Sessions
**Goal**: Claude can read what is on the globe and which browser tabs are open, with accurate live data
**Depends on**: Phase 17
**Target repo**: worldwideview (+ Redis)
**Requirements**: RSRC-01, RSRC-02, RSRC-03, RSRC-04
**Success Criteria** (what must be TRUE):
  1. `globe://state/{sessionId}` returns the current viewport (lat/lng/altitude/heading/pitch), active layer list, selected entity, and timeline position
  2. `globe://sessions` lists all open browser tabs with sessionId, viewport summary, active layers, and last-seen timestamp
  3. A closed browser tab drops from `globe://sessions` within 30 seconds (heartbeat TTL expiry)
  4. A viewport change in the browser is reflected in `globe://state` within 1 second (500ms debounce + network round trip)
**Plans**: TBD

### Phase 19: Globe Command Bridge
**Goal**: Claude can send pan, zoom, layer, and timeline commands that physically execute in the correct open browser tab
**Depends on**: Phase 18 (needs sessionIds from heartbeat registry)
**Target repo**: worldwideview (+ Redis)
**Requirements**: CTRL-01, CTRL-02, CTRL-03, CTRL-04, CTRL-05, CTRL-06
**Note**: Phases 19 and 20 can be executed in parallel once Phase 17 is complete
**Success Criteria** (what must be TRUE):
  1. Calling `pan_globe({ sessionId, lat: 35.68, lng: 139.69 })` causes the CesiumJS camera to fly to Tokyo in the targeted browser tab
  2. `toggle_layer` visibly enables or disables a plugin layer in the globe
  3. With 2 tabs open, Claude reads `globe://sessions`, picks the contextually correct tab, and only that tab receives the command
  4. Opening 10 concurrent MCP connections does not create 10 Redis subscriptions -- singleton subscriber confirmed
  5. A Redis restart does not permanently break command delivery; the subscriber reconnects and commands resume within 5 seconds
**Plans**: TBD

### Phase 20: Data Query Tools
**Goal**: Claude can query live entity data across all active plugins without requiring an open browser tab
**Depends on**: Phase 17 (stateless reads from data engine REST; no browser session required)
**Target repo**: worldwideview MCP route + **wwv-data-engine** (REST query delegation) -- cross-repo
**Requirements**: QUERY-01, QUERY-02, QUERY-03, QUERY-04
**Note**: Can be executed in parallel with Phase 19
**Success Criteria** (what must be TRUE):
  1. `search_entities({ query: "Singapore" })` returns entities from active plugins near Singapore with id, name, lat/lng, plugin
  2. `get_entities_in_region` with a bounding box returns all entities within it, respecting the optional `pluginId` filter
  3. `get_entity_details` returns the full properties object for a specific entity without error
  4. `get_plugin_data` returns the current snapshot gracefully even when the plugin has no active data (empty array, not a crash)
**Plans**: TBD

### Phase 21: Plugin-Contributed Tools + Quality
**Goal**: Installed plugins expose their own namespaced MCP tools; the tool list updates dynamically; the feature is documented and tested
**Depends on**: Phases 19 and 20
**Target repo**: worldwideview MCP route + **`@worldwideview/wwv-plugin-sdk`** (manifest extension) + **wwv-data-engine** (plugin tool delegation) + **worldwideview-marketplace** JWT bridge (`list_plugins` / `install_plugin`) -- cross-repo, 3 external deps
**Requirements**: PLUG-01, PLUG-02, PLUG-03, PLUG-04, PLG-01, PLG-02, MCP-QA-01, MCP-QA-02, MCP-QA-03
**Success Criteria** (what must be TRUE):
  1. A plugin with `mcpTools` in its manifest has those tools registered as `{pluginId}__toolName`; existing plugins without `mcpTools` are unaffected
  2. Installing a new plugin fires `notifications/tools/list_changed`; Claude's next `tools/list` call includes the new plugin's tools
  3. `list_plugins()` returns marketplace plugins with accurate install status; `install_plugin({ pluginSlug })` triggers the existing JWT bridge flow
  4. The README contains a copy-pasteable Claude Code MCP config block that works end-to-end with a generated API key
  5. Vitest tests pass: auth rejection (401), tool dispatch to correct handler, malformed input errors, Redis singleton reconnection

## Progress

**Execution Order:**
Phases execute in numeric order, with one parallel branch: 16 -> 17 -> { 18 -> 19, 20 } -> 21
(Phases 19 and 20 may run in parallel once 17 is done; 18 must precede 19.)

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 16. API Key Auth Foundation | v1.2 | 3/4 | In Progress|  |
| 17. MCP Server Foundation | v1.2 | 1/3 | In Progress|  |
| 18. Globe State Sync + Sessions | v1.2 | 0/? | Not started | - |
| 19. Globe Command Bridge | v1.2 | 0/? | Not started | - |
| 20. Data Query Tools | v1.2 | 0/? | Not started | - |
| 21. Plugin-Contributed Tools + Quality | v1.2 | 0/? | Not started | - |
