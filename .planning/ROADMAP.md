# Roadmap: WorldWideView

## Milestones

- [x] **v1.2 Full MCP Support** - Phases 16-21 (shipped 2026-05-30) - [archive](milestones/v1.2-ROADMAP.md)
- [ ] **v1.3 Location Intelligence** - Phases 22-25 (in progress)

## Phases

<details>
<summary>v1.2 Full MCP Support (Phases 16-21) - SHIPPED 2026-05-30</summary>

- [x] Phase 16: API Key Auth Foundation (4/4 plans) - completed 2026-05-29
- [x] Phase 17: MCP Server Foundation (3/3 plans) - completed 2026-05-30
- [x] Phase 18: Globe State Sync + Sessions (4/4 plans + gap-closure) - completed 2026-05-30
- [x] Phase 19a: Globe Command Bridge poll-based (3/3 plans) - completed 2026-05-30
- [x] Phase 19b: SSE Push Transport (2/2 plans) - completed 2026-05-30
- [x] Phase 20: Data Query Tools (4/4 plans) - completed 2026-05-30
- [x] Phase 21: Plugin-Contributed Tools + Quality (5/5 plans) - completed 2026-05-30

Full details: [milestones/v1.2-ROADMAP.md](milestones/v1.2-ROADMAP.md)

</details>

### v1.3 Location Intelligence

- [x] **Phase 22: Geocoding + Favorites** - Geocode places, fly the globe, bookmark tracked entities (4/4 plans, verified 2026-05-31)
- [x] **Phase 23: Entity Filtering** - Push live filters to the globe and query plugin-declared filter schemas
- [ ] **Phase 24: Route Wiring + Version Bump** - Wire all v1.3 registrars into the MCP handler and ship MCP_SERVER_VERSION 1.3.0
- [ ] **Phase 25: Documentation** - MCP tool docs, plugin author filter guide, user-facing capability summary, and v1.3 release notes

## Phase Details

### Phase 22: Geocoding + Favorites
**Goal**: AI agents can find any place on Earth by name, fly the globe camera to it, and bookmark tracked entities for later retrieval
**Depends on**: Phase 21 (v1.2 SSE command bridge, authenticateApiKey, Redis, Prisma Favorite model)
**Requirements**: GEO-01, GEO-02, GEO-03, FAV-01, FAV-02, FAV-03, SAFE-01, SAFE-02
**Success Criteria** (what must be TRUE):
  1. Agent calls `geocode_location("Paris")` and receives ranked results with lat/lng/name/bbox without triggering Nominatim rate limits across repeated calls
  2. Agent calls `fly_to(48.85, 2.35)` and the live globe camera pans to that coordinate within SSE push latency (< 100ms)
  3. Agent calls `save_favorite`, then `list_favorites`, and the saved entity appears with a `status` field reflecting whether it is currently live in the data stream
  4. Agent calls `remove_favorite` and the entry is gone from subsequent `list_favorites` responses
  5. All new tools return a structured error (not 500) when called in demo edition, consistent with v1.2 isDemo gate behavior
**Plans**: TBD

### Phase 23: Entity Filtering
**Goal**: AI agents can push live filters to the globe and discover what filter fields each plugin exposes
**Depends on**: Phase 22 (isDemo + authenticateApiKey patterns established, GlobeCommand type in Redis/SSE bridge)
**Requirements**: FILT-01, FILT-02, FILT-03, FILT-04
**Success Criteria** (what must be TRUE):
  1. Agent calls `set_filter("flights", { status: "airborne" })` and the globe immediately hides non-airborne entities without a page reload
  2. Agent calls `clear_filter()` with no arguments and all active plugin filters are removed from the globe in one command
  3. Agent calls `get_plugin_filters("flights")` and receives the filterable fields declared in that plugin's session catalog entry
  4. Agent passes `filters` to the existing `search_entities` call and receives only matching results, with no dependency on prior `set_filter` state
**Plans**: 3 plans (ships atomically per STATE.md)
- [x] 23-01-PLAN.md — Foundation: GlobeCommand setFilter/clearFilter variants + validator, bridge dispatch into filterSlice, shared filterValueSchema, matchFilterValue extraction, catalog filterDefinitions, RED tool stubs (wave 1, TDD)
- [x] 23-02-PLAN.md — Filter MCP tools (set_filter, clear_filter, get_plugin_filters), search_entities filters param on properties, catalog publisher emits filterDefinitions (wave 2, TDD)
- [x] 23-03-PLAN.md — Wire registerFilterTools into the MCP route + atomic phase integration verification (wave 3)

### Phase 24: Route Wiring + Version Bump
**Goal**: All v1.3 tools are reachable via the production MCP endpoint and the server self-reports version 1.3.0
**Depends on**: Phase 22, Phase 23 (all registrars implemented)
**Requirements**: INTG-01 (integration wiring), INTG-02 (version bump)
**Success Criteria** (what must be TRUE):
  1. MCP `tools/list` response includes all v1.3 tools: `geocode_location`, `fly_to`, `save_favorite`, `list_favorites`, `remove_favorite`, `set_filter`, `clear_filter`, `get_plugin_filters`
  2. MCP server `serverInfo.version` field returns `"1.3.0"` on every initialize handshake
  3. `search_entities` with optional `filters` param is reflected in the tool schema exposed to clients
**Plans**: TBD

### Phase 25: Documentation
**Goal**: Every v1.3 feature is fully documented for three audiences: MCP clients (tool schemas), plugin developers (filter manifest guide), and end users (capability summary)
**Depends on**: Phase 24 (all tools shipped and wired; final tool schemas stable)
**Requirements**: DOC-01, DOC-02, DOC-03, DOC-04
**Success Criteria** (what must be TRUE):
  1. Every v1.3 MCP tool description in `registerGeocodingTools`, `registerFavoritesTools`, `registerFilterTools` includes: what it does, all input params with types, the output shape, and at least one usage example
  2. A `docs/plugin-filter-guide.md` (or equivalent) explains how a plugin author declares `filterDefinitions` in their manifest with a complete worked example for a hypothetical flights plugin
  3. ConnectAgentHelper or a linked doc lists all v1.3 tools an agent can call, with a plain-English description of each capability
  4. A v1.3 changelog entry (in `CHANGELOG.md` or the PR body) lists all 8 new MCP tools, the `search_entities` filter enhancement, and the version bump to 1.3.0
**Plans**: TBD

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 22. Geocoding + Favorites | 4/4 | Complete ✓ | 2026-05-31 |
| 23. Entity Filtering | 3/3 | Complete | 2026-05-31 |
| 24. Route Wiring + Version Bump | 0/? | Not started | - |
| 25. Documentation | 0/? | Not started | - |

## Backlog

Per the 21-REPLAN locked decision ("NO marketplace" in v1.2 scope), the two marketplace
plugin-management MCP tools were deferred. They require the marketplace JWT install bridge,
which was descoped to keep v1.2 worldwideview-only.

- **999.1 -- PLG-01: `list_plugins()` MCP tool** -- returns all marketplace plugins with
  install status for the authenticated user. Depends on marketplace API + JWT bridge.
- **999.2 -- PLG-02: `install_plugin({ pluginSlug })` MCP tool** -- triggers installation via
  the existing marketplace JWT bridge flow. Depends on PLG-01 + marketplace install endpoint.

- **999.3 -- UX-01: Show MCP / ConnectAgentHelper as "Cloud edition" upgrade CTA in demo** --
  Currently `!isDemo` in Header.tsx:449 hides the entire ConnectAgentHelper section in demo.
  UX improvement: surface it as a locked/teaser CTA that explains the feature and links to
  upgrade. Pairs with v1.3 MCP-OBSERVATIONS.md scope (geocoding, OSM search, basemap control,
  entity filtering, enhanced search, favorites, plugin-tool discovery).

Also tracked as partials (functional, refinement deferred):
- **CTRL-02** focus_entity entityId-only resolution -- currently a no-op without lat/lng;
  needs entity-id -> coordinate lookup wired into the command dispatch.
- **MCP-QA-03** explicit Redis reconnect test -- stateless SSE arch makes the original
  WebSocket-subscriber spec N/A; ioredis auto-reconnects. Add a reconnect test if reliability
  concerns arise.
