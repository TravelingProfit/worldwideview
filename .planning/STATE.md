---
gsd_state_version: 1.0
milestone: v1.4
milestone_name: Agentic Intelligence
status: planning
last_updated: "2026-05-31T03:47:00.000Z"
last_activity: 2026-05-31
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-31)

**Core value:** A single globe controllable by any AI agent via MCP -- where the agent arrives oriented, investigates intelligently, and acts with confidence.
**Current focus:** Phase 26 -- Server Instructions + Orientation (roadmap defined, ready to plan)

## Current Position

Phase: 26 (not started)
Plan: -
Status: Roadmap defined, awaiting /gsd:plan-phase 26
Last activity: 2026-05-31 -- v1.4 roadmap written (Phases 26-29, 13 requirements mapped)
Resume file: None

Progress: [__________] 0% (0 of 4 phases complete)

## v1.4 Phase Map

| Phase | Goal | Key requirements |
|-------|------|-----------------|
| 26 | Server Instructions + Orientation | INST-01, INST-02, INST-03, INST-04 |
| 27 | Tool Description Rewrite | DESC-01, DESC-02, DESC-03 |
| 28 | Smart Response Contracts + Favorites CRUD | RESP-01, RESP-02, CRUD-01 |
| 29 | Compound and Discovery Tools | TOOL-01, TOOL-02, TOOL-03 |

## Key Decisions (carried from v1.2/v1.3)

- **MCP transport:** Stateless Streamable HTTP at /api/mcp; raw @modelcontextprotocol/sdk; Bearer auth via authenticateApiKey(). No custom server.ts.
- **Redis for ephemeral state:** Globe state, command queues, session catalogs all in Redis. PostgreSQL for user-owned persistent data.
- **SSE command bridge:** EventSource-based push (GET /api/globe/commands/stream). Reuse for fly_to in v1.3.
- **Plugin tools via frontend relay:** No engine endpoint. useMcpCatalogPublisher + useMcpRelayBridge pattern.
- **Three editions:** NEXT_PUBLIC_WWV_EDITION (local/cloud/demo). isDemo gate runs before auth on all new endpoints.
- **Generic API keys:** wwv_prefix.secret bearer tokens. authenticateApiKey() middleware reused for all new MCP tools.

## v1.3 Phase Map (archived reference)

| Phase | Goal | Key requirements |
|-------|------|-----------------|
| 22 | Geocoding + Favorites | GEO-01..03, FAV-01..03, SAFE-01..02 |
| 23 | Entity Filtering | FILT-01..04 |
| 24 | Route Wiring + Version Bump | INTG-01, INTG-02 |
| 25 | Documentation | DOC-01..04 |

## Blockers

None.

## Accumulated Context

- v1.2 archived at .planning/milestones/v1.2-* and tagged v1.2 in git.
- PR #215 (feat/mcp-support) open on GitHub, awaiting merge.
- v1.3 complete 2026-05-31. All 4 phases shipped, tsc clean, 750 tests GREEN.
- Phase numbering: v1.4 starts at Phase 26 (v1.3 ended at Phase 25).
- Phase 26 is pure configuration/server-init work -- no new tool implementations. McpServer `instructions` string + two MCP Prompt registrations.
- Phase 27 is pure description text rewriting across 15+ existing tools -- no schema changes, no new tools. Lowest risk phase.
- Phase 28 requires code changes to query handler return shapes (emptyReason field) and one new Prisma mutation (update_favorite). Coordinate with prisma.favorite model in Phase 28 plan.
- Phase 29 is the most complex: investigate_area is a compound tool that chains geocode -> plugin check -> region query -> SSE command -> prose generation internally. Design the internal chain carefully; it must not expose intermediate tool results to the caller.
- Nominatim integration: server-side rate limiter (1 req/sec Redis sliding window) + 24h result cache are already live (GEO-03, Phase 22). investigate_area (TOOL-03) reuses this path -- do not re-implement.
- Favorites use prisma.favorite directly -- never proxy through /api/user/favorites (cookie auth incompatible with API key sessions, SAFE-02). update_favorite (CRUD-01) must follow same pattern.
- emptyReason values are an enum contract: "plugin_not_streaming" | "no_data_matches" | "no_session_active". Agree on this enum in Phase 28 and reference it in Phase 27 tool description rewrites -- do Phase 27 after Phase 26 but the enum must be locked before DESC-02 is written.
