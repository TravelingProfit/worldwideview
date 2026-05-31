# Requirements: WorldWideView v1.4 Agentic Intelligence

**Defined:** 2026-05-31
**Core Value:** A single globe controllable by any AI agent via MCP -- where the agent arrives oriented, investigates intelligently, and acts with confidence.

## v1.3 Requirements (shipped)

All v1.3 requirements are complete. See archive for details.

## v1.4 Requirements

### INST -- Server Instructions & Orientation

- [x] **INST-01**: MCP server returns a populated `instructions` field in InitializeResult containing a role-framing markdown document that tells agents who WWV is, what tools are available, and the mental model for using them
- [x] **INST-02**: The `instructions` document embeds canonical workflow sequences: geocode-first before fly_to, check plugin availability before querying entities, read globe://sessions before sending any command tool
- [x] **INST-03**: MCP server registers an `orient-globe` Prompt that agents can invoke to get a structured snapshot of current sessions, active layers, and loaded plugins in one response
- [x] **INST-04**: MCP server registers an `investigate` Prompt that accepts a place name and guides the agent step-by-step through geocode -> plugin availability check -> region query -> globe action

### DESC -- Tool Description Rewrite (6-component standard)

Tool descriptions must include: (1) purpose verb+object front-loaded, (2) when-to-use vs. alternatives, (3) limitations and empty-result meaning, (4) parameter format + ranges, (5) concrete examples, (6) appropriate length (not truncated at the key sentence).

- [x] **DESC-01**: All globe command tools rewritten to 6-component standard: `pan_globe`, `fly_to`, `focus_entity`, `toggle_layer`, `set_timeline` -- each includes sessions precondition inline and distinguishes from its nearest alternative
- [x] **DESC-02**: All data query tools rewritten to 6-component standard: `search_entities`, `get_entities_in_region`, `get_entity_details`, `get_plugin_data` -- each includes plugin-availability note and explanation of what empty results mean
- [x] **DESC-03**: All v1.3 tools rewritten to 6-component standard: `geocode_location`, `set_filter`, `clear_filter`, `get_plugin_filters`, `save_favorite`, `list_favorites`, `remove_favorite`

### RESP -- Smart Response Contracts

- [x] **RESP-01**: All query tools (`search_entities`, `get_entities_in_region`, `get_entity_details`, `get_plugin_data`) include an `emptyReason` field when results are empty: `"plugin_not_streaming"` | `"no_data_matches"` | `"no_session_active"`
- [ ] **RESP-02**: `get_plugin_filters` returns `{ available: false, reason: "plugin not loaded" }` (not an empty array) when the requested plugin is not active in the engine

### TOOL -- New Compound & Discovery Tools

- [ ] **TOOL-01**: `list_available_plugins` MCP tool returns which plugins are currently streaming data to the engine, including entity counts and queryable entity types per plugin -- agents call this before attempting any data query
- [ ] **TOOL-02**: `get_globe_context` MCP tool returns a full orientation snapshot in one call: active session count, camera position, active layers, applied filters, loaded plugin list -- replaces reading multiple resources separately
- [ ] **TOOL-03**: `investigate_area(place_name, entity_type, radius_km?)` compound MCP tool that internally geocodes the place, checks which plugins are streaming the entity type, queries the bounding region, positions the globe camera, and returns both the entity list and a prose situation summary

### CRUD -- Full Favorites Lifecycle

- [x] **CRUD-01**: `update_favorite(favoriteId, { name?, notes? })` MCP tool allows agents to rename or annotate a saved bookmark without deleting and re-creating it -- completes Create/Read/Update/Delete lifecycle for favorites

## Future Requirements (deferred)

### Plugin Marketplace Integration

- PLG-01: `list_plugins` MCP tool showing available marketplace plugins
- PLG-02: `install_plugin` MCP tool to install a plugin from the marketplace
- UX-01: ConnectAgentHelper upgrade CTA in demo edition

### Advanced Investigation

- Multi-turn investigation memory (agent remembers prior findings across sessions)
- Proactive monitoring (agent watches for changes and alerts)
- Saved investigation reports (persistent CRUD for investigation outputs)
- Filter presets (save/apply named filter configurations)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Embedding AI chat UI in the globe | MCP is server-only; chat is the client's job |
| Browser-side MCP client | Globe is an MCP server target, not client |
| Playwright / computer-use control | SSE command bridge is the pattern |
| Stdio MCP transport | HTTP/SSE for production deployability |
| OAuth 2.1 for MCP auth | Personal API keys sufficient |
| API key scopes/permissions/rotation | Revisit post-v1.4 |
| Proactive monitoring / push alerts | Agent-pulls model only in v1.4 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INST-01 | Phase 26 | Complete |
| INST-02 | Phase 26 | Complete |
| INST-03 | Phase 26 | Complete |
| INST-04 | Phase 26 | Complete |
| DESC-01 | Phase 27 | Complete |
| DESC-02 | Phase 27 | Complete |
| DESC-03 | Phase 27 | Complete |
| RESP-01 | Phase 28 | Complete |
| RESP-02 | Phase 28 | Pending |
| CRUD-01 | Phase 28 | Complete |
| TOOL-01 | Phase 29 | Pending |
| TOOL-02 | Phase 29 | Pending |
| TOOL-03 | Phase 29 | Pending |

**Coverage:**
- v1.4 requirements: 13 total
- Mapped to phases: 13
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-31*
*Last updated: 2026-05-31 after initial v1.4 definition*
