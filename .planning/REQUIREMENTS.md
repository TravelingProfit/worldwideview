# Requirements: WorldWideView v1.3

**Defined:** 2026-05-31
**Core Value:** A single globe that shows everything happening in the world right now, extensible by anyone via plugins, and controllable by any AI agent via MCP.

## v1.3 Requirements

### Geocoding

- [ ] **GEO-01**: Agent can call `geocode_location(query)` and receive 2-5 ranked results with `{lat, lng, name, type, country, bbox, importance}` via Nominatim
- [x] **GEO-02**: Agent can call `fly_to(lat, lng, altitude?, bbox?)` to pan/zoom the globe camera; when `bbox` is provided, Cesium fits the region to the bounding box
- [x] **GEO-03**: Geocoding enforces a server-side 1 req/sec Redis sliding window rate limiter and caches results for 24 hours to prevent Nominatim IP ban

### Filtering

- [x] **FILT-01**: Agent can call `set_filter(pluginId, filters)` to push a live filter to the globe via the SSE command bridge; browser applies it to Zustand filterSlice
- [x] **FILT-02**: Agent can call `clear_filter(pluginId?)` to remove all active filters or per-plugin filters via SSE bridge
- [x] **FILT-03**: Agent can call `get_plugin_filters(pluginId)` to retrieve filterable fields declared by a plugin via session catalog extension
- [x] **FILT-04**: Agent can pass optional `filters` params to the existing `search_entities` tool to receive pre-filtered results inline (no set_filter state dependency)

### Favorites

- [ ] **FAV-01**: Agent can call `save_favorite(entityId, pluginId, name?)` to bookmark a tracked entity per-user (upsert on existing `Favorite` Prisma model)
- [ ] **FAV-02**: Agent can call `list_favorites()` to retrieve saved entities with `status: "live" | "stale"` (stale = entity not currently in data stream)
- [ ] **FAV-03**: Agent can call `remove_favorite(entityId, pluginId)` to delete a saved bookmark

### Safety & Guards

- [x] **SAFE-01**: All new MCP tool registrars check `isDemo` gate before `authenticateApiKey()`, consistent with v1.2 pattern
- [ ] **SAFE-02**: MCP favorites tools call `prisma.favorite` directly and never proxy through the REST `/api/user/favorites` route (which uses NextAuth cookie auth and silently 401s on API key requests)

### Integration

- [ ] **INTG-01**: All v1.3 tool registrars (geocoding, favorites, filtering) are wired into the MCP POST handler; `tools/list` exposes all 8 new tools
- [ ] **INTG-02**: `MCP_SERVER_VERSION` constant is bumped to `"1.3.0"` and reflected in every `initialize` response `serverInfo.version`

### Documentation

- [ ] **DOC-01**: Each v1.3 MCP tool has a complete tool-level description in its registrar (input schema, output shape, error codes, usage example) so it is self-documenting via `tools/list`
- [ ] **DOC-02**: A developer guide exists explaining how to declare filterable fields in a plugin manifest (`filterDefinitions` extension) with a worked example
- [ ] **DOC-03**: The user-facing ConnectAgentHelper or a companion doc describes all v1.3 capabilities available to connected agents (geocoding, filtering, favorites)
- [ ] **DOC-04**: A changelog / release notes entry is written for v1.3 covering the 8 new MCP tools, 2 integration changes, and 1 search enhancement

## Future Requirements (v1.4+)

### Marketplace Tools (Backlog)
- **PLG-01**: Agent can call `list_plugins()` to browse available marketplace plugins
- **PLG-02**: Agent can call `install_plugin(pluginId)` to install a marketplace plugin
- **UX-01**: ConnectAgentHelper shows upgrade CTA in demo edition

### Geocoding Enhancements
- Reverse geocoding: coordinates to address
- Structured address input (street, city, country)
- Provider fallback (Photon, OpenCage)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Reverse geocoding | Not in v1.3 goals; forward search sufficient |
| Filter state persisted in Redis | Zustand is single source of truth; SSE push only |
| search_entities as a new filtered tool | Extended existing tool with optional filters instead |
| MCP favorites REST proxy | Architecture invariant: API key auth != cookie auth |
| OAuth 2.1 for MCP auth | Personal API keys sufficient |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| GEO-01 | Phase 22 | Pending |
| GEO-02 | Phase 22 | Complete |
| GEO-03 | Phase 22 | Complete |
| FAV-01 | Phase 22 | Pending |
| FAV-02 | Phase 22 | Pending |
| FAV-03 | Phase 22 | Pending |
| SAFE-01 | Phase 22 | Complete |
| SAFE-02 | Phase 22 | Pending |
| FILT-01 | Phase 23 | Complete |
| FILT-02 | Phase 23 | Complete |
| FILT-03 | Phase 23 | Complete |
| FILT-04 | Phase 23 | Complete |
| INTG-01 | Phase 24 | Pending |
| INTG-02 | Phase 24 | Pending |
| DOC-01 | Phase 25 | Pending |
| DOC-02 | Phase 25 | Pending |
| DOC-03 | Phase 25 | Pending |
| DOC-04 | Phase 25 | Pending |

**Coverage:**
- v1.3 requirements: 18 total
- Mapped to phases: 18
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-31*
*Last updated: 2026-05-31 after Phase 25 documentation phase added*
