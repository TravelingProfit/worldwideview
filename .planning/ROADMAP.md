# Roadmap: WorldWideView

## Milestones

- [x] **v1.2 Full MCP Support** - Phases 16-21 (shipped 2026-05-30) - [archive](milestones/v1.2-ROADMAP.md)
- [x] **v1.3 Location Intelligence** - Phases 22-25 (completed 2026-05-31)
- [ ] **v1.4 Agentic Intelligence** - Phases 26-29 (active)

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

<details>
<summary>v1.3 Location Intelligence (Phases 22-25) - COMPLETE 2026-05-31</summary>

- [x] **Phase 22: Geocoding + Favorites** - Geocode places, fly the globe, bookmark tracked entities (4/4 plans, verified 2026-05-31)
- [x] **Phase 23: Entity Filtering** - Push live filters to the globe and query plugin-declared filter schemas
- [x] **Phase 24: Route Wiring + Version Bump** - Wire all v1.3 registrars into the MCP handler and ship MCP_SERVER_VERSION 1.3.0
- [x] **Phase 25: Documentation** - MCP tool docs, plugin author filter guide, user-facing capability summary, and v1.3 release notes (1/1 plans, completed 2026-05-31)

</details>

### v1.4 Agentic Intelligence

- [x] **Phase 26: Server Instructions + Orientation** - Agent arrives oriented with role framing, canonical workflows, and named MCP Prompts baked into the server (completed 2026-05-31)
- [x] **Phase 27: Tool Description Rewrite** - All 15+ existing tools rewritten to the 6-component standard so agents select and invoke them correctly on the first try (completed 2026-05-31)
- [x] **Phase 28: Smart Response Contracts + Favorites CRUD** - Query responses carry semantic empty reasons, get_plugin_filters signals unavailable plugins, and favorites gain full update support (completed 2026-05-31)
- [x] **Phase 29: Compound and Discovery Tools** - Three new tools let agents self-orient and investigate in one call rather than assembling multi-step pipelines manually (completed 2026-05-31)

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
**Plans**: 24-01 (COMPLETE) - INTG-01 verified, INTG-02 shipped (MCP_SERVER_VERSION 1.3.0)
**Status**: COMPLETE 2026-05-31. tsc clean, 750 Vitest tests GREEN, build OK. Commits 5201ae3, 5ea7855.

### Phase 25: Documentation
**Goal**: Every v1.3 feature is fully documented for three audiences: MCP clients (tool schemas), plugin developers (filter manifest guide), and end users (capability summary)
**Depends on**: Phase 24 (all tools shipped and wired; final tool schemas stable)
**Requirements**: DOC-01, DOC-02, DOC-03, DOC-04
**Success Criteria** (what must be TRUE):
  1. Every v1.3 MCP tool description in `registerGeocodingTools`, `registerFavoritesTools`, `registerFilterTools` includes: what it does, all input params with types, the output shape, and at least one usage example
  2. A `docs/plugin-filter-guide.md` (or equivalent) explains how a plugin author declares `filterDefinitions` in their manifest with a complete worked example for a hypothetical flights plugin
  3. ConnectAgentHelper or a linked doc lists all v1.3 tools an agent can call, with a plain-English description of each capability
  4. A v1.3 changelog entry (in `CHANGELOG.md` or the PR body) lists all 8 new MCP tools, the `search_entities` filter enhancement, and the version bump to 1.3.0
**Plans**: 25-01 (COMPLETE) - DOC-01..04 closed.
**Status**: COMPLETE 2026-05-31. Enriched all 8 v1.3 tool descriptions (DOC-01), added docs/plugin-filter-guide.md (DOC-02), listed all tools in ConnectAgentHelper (DOC-03), added CHANGELOG.md v1.3.0 entry (DOC-04). tsc clean, 750 Vitest tests GREEN, build OK. Commits 84f8ade, 26d2063, 2eec714, f1405bd.

### Phase 26: Server Instructions + Orientation
**Goal**: A fresh AI agent connecting to the WWV MCP server for the first time receives a complete orientation -- who WWV is, what tools exist, and the canonical workflows to follow -- without the user having to explain anything
**Depends on**: Phase 25 (v1.3 complete; stable tool set as orientation baseline)
**Requirements**: INST-01, INST-02, INST-03, INST-04
**Success Criteria** (what must be TRUE):
  1. The MCP `initialize` response contains a non-empty `instructions` field with a role-framing header, a mental model for the globe/plugins/sessions, and at least two explicit "do X before Y" rules (read sessions before commanding; check plugin availability before querying)
  2. A fresh agent that has only read `instructions` correctly answers: "What do I need to do before calling pan_globe?" without having read any individual tool description
  3. Calling `prompts/list` returns both `orient-globe` and `investigate` prompt names; calling `prompts/get` on each returns a structured, step-numbered template with no placeholder text
  4. An agent invoking the `orient-globe` prompt receives a single response containing active sessions, loaded plugin layers, and current camera state -- no follow-up resource reads needed to get oriented
**Plans**: TBD

### Phase 27: Tool Description Rewrite
**Goal**: Every existing MCP tool description satisfies the 6-component standard so an agent selects the right tool, passes correct arguments, and correctly interprets empty results on the first attempt
**Depends on**: Phase 26 (instructions written first; tool descriptions must align with the canonical workflows stated there)
**Requirements**: DESC-01, DESC-02, DESC-03
**Success Criteria** (what must be TRUE):
  1. Every command tool description (`pan_globe`, `fly_to`, `focus_entity`, `toggle_layer`, `set_timeline`) contains inline: the sessions precondition, what "no active session" means, and when to prefer this tool over its nearest alternative
  2. Every data query tool description (`search_entities`, `get_entities_in_region`, `get_entity_details`, `get_plugin_data`) states explicitly what an empty result means -- distinguishing "plugin not loaded" from "no matching data"
  3. Every v1.3 tool description (`geocode_location`, `set_filter`, `clear_filter`, `get_plugin_filters`, `save_favorite`, `list_favorites`, `remove_favorite`) passes the 6-component checklist: purpose, when-to-use, limitations, parameter format, example, complete length
  4. No tool description is truncated at a critical constraint; each fits within MCP client display limits while retaining all mandatory guidance
**Plans**: 3 plans (all wave 1, parallel -- no file overlap)
- [x] 27-01-PLAN.md — DESC-01: rewrite 4 globe command tool descriptions (pan_globe, focus_entity, toggle_layer, set_timeline) + assertion tests
- [x] 27-02-PLAN.md — DESC-02: rewrite 4 data query tool descriptions with empty-result semantics + new tools.test.ts
- [x] 27-03-PLAN.md — DESC-03: conform 8 v1.3 tool descriptions across geocoding/filter/favorites (fly_to gets the sessions precondition) + assertion tests

### Phase 28: Smart Response Contracts + Favorites CRUD
**Goal**: Query tools communicate WHY results are empty rather than returning identical empty arrays for unrelated failure modes, and agents can update a saved favorite without deleting and recreating it
**Depends on**: Phase 27 (tool descriptions must reference emptyReason semantics described there)
**Requirements**: RESP-01, RESP-02, CRUD-01
**Success Criteria** (what must be TRUE):
  1. Calling `search_entities` with a plugin that has no active streaming session returns `{ success: true, entities: [], count: 0, emptyReason: "plugin_not_streaming" }` -- distinct from a query that returns `"no_data_matches"` when the plugin is streaming but nothing matches the filter
  2. Calling `search_entities` when no globe session is active returns `emptyReason: "no_session_active"` -- the agent can distinguish this from a data absence without guessing
  3. Calling `get_plugin_filters("flights")` when the flights plugin is not loaded returns `{ available: false, reason: "plugin not loaded" }` rather than an empty array, allowing the agent to report the real cause to the user
  4. Calling `update_favorite(id, { name: "New Name", notes: "Updated note" })` persists the change and is reflected in the next `list_favorites` response without requiring `remove_favorite` + `save_favorite`
**Plans**: 3 plans
- [x] 28-01-PLAN.md — RESP-01: emptyReason discriminated service results + userId threading into registerDataQueryTools + 4-tool passthrough with session-first precedence + tests (wave 1)
- [x] 28-02-PLAN.md — RESP-02: get_plugin_filters availability wrapper (4 shapes) + Phase 27 description/test updates (wave 2, depends on 28-01 for route.ts seam)
- [x] 28-03-PLAN.md — CRUD-01: [BLOCKING] notes String? migration + update_favorite tool + list_favorites notes surfacing + tests (wave 1, independent files)

### Phase 29: Compound and Discovery Tools
**Goal**: Agents can answer "what is happening near X?" in a single tool call, check which plugins are active before querying, and orient themselves completely without reading multiple resources
**Depends on**: Phase 28 (emptyReason contracts and CRUD-01 must be complete; investigate_area depends on emptyReason to characterize its sub-query results)
**Requirements**: TOOL-01, TOOL-02, TOOL-03
**Success Criteria** (what must be TRUE):
  1. Calling `list_available_plugins` returns a list of currently streaming plugins with entity counts and queryable entity types; an agent that calls this before `search_entities` never receives a `plugin_not_streaming` emptyReason it did not anticipate
  2. Calling `get_globe_context` returns in one response: active session count, camera position, active layers, applied filters, and loaded plugin list -- an agent that reads this resource needs no additional `globe://sessions`, `globe://state`, or `globe://layers` reads to be fully oriented
  3. Calling `investigate_area("Auckland", "flights")` internally geocodes the place, checks which plugins stream flights, queries the bounding region, positions the globe camera over Auckland, and returns both the entity list and a prose situation summary describing what is happening in that area
  4. `investigate_area` returns a meaningful prose report even when no entities match -- the summary explains why (e.g., no active flight plugin) rather than returning an empty structure
**UI hint**: no
**Plans**: 1 plan
- [x] 29-01-PLAN.md — All three discovery tools (list_available_plugins, get_globe_context, investigate_area) in discoveryTools.ts + shared discoveryHelpers.ts + route wiring + tests

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 22. Geocoding + Favorites | 4/4 | Complete | 2026-05-31 |
| 23. Entity Filtering | 3/3 | Complete | 2026-05-31 |
| 24. Route Wiring + Version Bump | 1/1 | Complete | 2026-05-31 |
| 25. Documentation | 1/1 | Complete | 2026-05-31 |
| 26. Server Instructions + Orientation | 1/1 | Complete   | 2026-05-31 |
| 27. Tool Description Rewrite | 3/3 | Complete   | 2026-05-31 |
| 28. Smart Response Contracts + Favorites CRUD | 3/3 | Complete   | 2026-05-31 |
| 29. Compound and Discovery Tools | 1/1 | Complete   | 2026-05-31 |
| 30. Local Data-Source Bridge | 4/4 | Complete   | 2026-06-02 |

## Backlog

Per the 21-REPLAN locked decision ("NO marketplace" in v1.2 scope), the two marketplace
plugin-management MCP tools were deferred. They require the marketplace JWT install bridge,
which was descoped to keep v1.2 worldwideview-only.

- **999.1 -- PLG-01: `list_plugins()` MCP tool** -- returns all marketplace plugins with
  install status for the authenticated user. Depends on marketplace API + JWT bridge.
- **999.2 -- PLG-02: `install_plugin({ pluginSlug })` MCP tool** -- triggers installation via
  the existing marketplace JWT install bridge flow. Depends on PLG-01 + marketplace install endpoint.

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

### Phase 30: Local Data-Source Bridge: make server-reachable client-side and static plugins (camera GeoJSON, OSM-static plugins) queryable via MCP through a generalized LocalDataSource registry. Closes the MCP coverage gap where browser-loaded plugins return plugin_not_streaming. Camera is the first consumer.

**Goal:** Server-reachable client-side/static plugins (camera GeoJSON + traffic route) are MCP-queryable through a generalized manifest-declared LocalDataSource registry, with NO browser session -- closing the plugin_not_streaming coverage gap. Acceptance: a Russia-bbox `get_entities_in_region(pluginId:"camera")` returns the in-box cameras and `list_available_plugins` lists camera as `source:"local"` with a non-zero count.
**Requirements**: D-01..D-08 (CONTEXT decisions), RESP-01 (emptyReason contract preserved), TOOL-01/TOOL-02 (discovery surface)
**Depends on:** Phase 29
**Plans:** 4/4 plans complete

Plans:
- [x] 30-01-PLAN.md — Foundation: SDK LocalDataSourceDeclaration type + camera package.json localData declaration + sync-local-plugins passthrough + validateManifest localData validator (wave 1, TDD)
- [x] 30-02-PLAN.md — localSources module: manifest-driven registry + server-side GeoJSON normalizer + per-source TTL cache (wave 2, TDD)
- [x] 30-03-PLAN.md — Integration seam: fetchPluginSnapshot engine->local->null fallback + getAllPluginSnapshots local-id union; Russia-bbox demo + D-06 emptyReason cases (wave 3, TDD)
- [x] 30-04-PLAN.md — Discovery surface: StreamingPlugin source:"engine"|"local" tag in listStreamingPlugins; camera surfaced in list_available_plugins/get_globe_context (wave 4, TDD)
