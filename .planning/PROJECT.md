# WorldWideView

## What This Is

WorldWideView is a real-time geospatial intelligence engine that visualizes live global data on an interactive 3D globe -- controllable by any AI agent via a production MCP server. Built for power users, researchers, and developers who need a live, plugin-extensible view of the world and want to connect their AI tools directly to it.

## Core Value

A single globe that shows everything happening in the world right now, extensible by anyone via plugins, and controllable by any AI agent via MCP.

## Current State (v1.2 shipped 2026-05-30)

**What shipped in v1.2:**
- Transport-agnostic personal API keys (wwv_prefix.secret bearer tokens)
- Production MCP server at /api/mcp (Streamable HTTP, stateless, Bearer auth)
- ConnectAgentHelper UI for one-copy-paste agent setup
- Globe state MCP resources (globe://state, globe://sessions, globe://layers)
- Globe control tools (pan_globe, focus_entity, toggle_layer, set_timeline) via SSE push
- Data query tools (search_entities, get_entities_in_region, get_entity_details, get_plugin_data)
- Plugin-contributed MCP tools via SDK manifest extension + frontend relay bridge

**Tech stack additions:** ioredis singleton, @modelcontextprotocol/sdk, ReadableStream SSE, Redis ZSET/LIST/SET for state/commands/catalog

## Current Milestone: v1.4 Agentic Intelligence

**Goal:** Transform the WWV MCP server from a collection of atomic tools into a well-instructed, investigation-capable AI assistant -- one that knows what it has, reasons over the globe, and delivers both globe actions and prose reports.

**Target features:**
- Server `instructions` field + workflow sequences (agent oriented from first connection)
- MCP Prompts for named workflows (`orient-globe`, `investigate`)
- Full 6-component tool description rewrite across all 15+ existing tools
- `emptyReason` field in all query responses (distinguishes "no data" from "plugin not loaded")
- `list_available_plugins` tool (agent checks before querying)
- `get_globe_context` tool (full orientation snapshot in one call)
- `investigate_area` compound tool (geocode + check + query + act + report)
- `update_favorite` tool (completes full CRUD lifecycle for favorites)

**Backlog (deferred):**
- PLG-01/PLG-02: list_plugins() + install_plugin() marketplace tools (backlog 999.1/999.2)
- UX-01: ConnectAgentHelper upgrade CTA in demo edition (backlog 999.3)

## Requirements

### Validated (Shipped)

**v1.0 Unified Auth Account System (Phases 1-11, shipped 2026-05-28)**
- Supabase shared-cookie auth federation across worldwideview, marketplace, and web
- OAuth (GitHub, Google) and email+password auth with NextAuth v5
- Shared user identity via `NEXT_PUBLIC_WWV_COOKIE_DOMAIN` across three apps
- JWT session persistence, auth callback redirect fix, linked accounts page
- Legal/privacy compliance (ToS, cookie consent, GDPR data deletion flow)

**v1.1 Plugin Install Auth Gate (Phase 12 shipped 2026-05-28)**
- PluginInstall model + migration + Plugin.installs counter
- Fire-and-forget install tracking upsert in GET /api/install/start

**v1.2 Full MCP Support (Phases 16-21, shipped 2026-05-30)**
- Transport-agnostic API keys with bcrypt storage and timing-oracle prevention - v1.2
- Stateless MCP server (Streamable HTTP) with Bearer auth - v1.2
- ConnectAgentHelper per-client setup UI; secret only in Authorization header - v1.2
- Globe state as MCP resources backed by Redis with heartbeat TTL - v1.2
- Globe command bridge via SSE push (< 100ms latency) - v1.2
- Data query tools across all active plugins - v1.2
- Plugin-contributed namespaced MCP tools via frontend relay - v1.2

### Active (v1.4 Agentic Intelligence)

- [ ] Server `instructions` field with role-framing and canonical workflow sequences
- [ ] MCP Prompts: `orient-globe` and `investigate` named workflow templates
- [ ] 6-component tool description rewrite for all command, query, and v1.3 tools
- [ ] `emptyReason` field on all query tool responses
- [ ] `get_plugin_filters` returns explicit `{available: false}` when plugin not active
- [ ] `list_available_plugins` MCP tool (streaming plugins + entity counts)
- [ ] `get_globe_context` MCP tool (full orientation snapshot)
- [ ] `investigate_area` compound MCP tool (geocode + check + query + act + prose report)
- [ ] `update_favorite` MCP tool (complete CRUD lifecycle for favorites)

### Out of Scope

- Embedding an AI chat UI inside the globe -- MCP is server-only
- Browser-side MCP client -- globe is an MCP server target, not client
- Playwright/computer-use globe control -- using SSE command bridge
- Stdio-only MCP transport -- HTTP/SSE for production deployability
- CLI tool -- API + MCP cover v1.2; CLI is additive and non-blocking
- API key scopes/permissions and rotation/grace-period flows -- revisit later
- OAuth 2.1 for MCP auth -- personal API keys sufficient for v1.2

## Context

- **Three apps**: worldwideview (Next.js globe), worldwideview-marketplace (plugin store), worldwideview-web (marketing)
- **Auth**: NextAuth v5 + Supabase shared cookies, auth host at worldwideview.dev
- **State**: 9 Zustand slices (globe, layers, timeline, ui, filter, data, config, favorites, geojson)
- **MCP**: Stateless Streamable HTTP at /api/mcp; Redis for state/commands/catalog; 8 tools + 3 resources
- **Data pipeline**: wwv-data-engine (Fastify + Redis) + plugin seeders
- **Plugin SDK**: `@worldwideview/wwv-plugin-sdk` with mcpTools manifest extension

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Supabase shared-cookie auth federation | Single sign-on across 3 Next.js apps | ✓ Good |
| JWT install bridge for plugin installs | Instance-level auth keeps globe secure | ✓ Good |
| HTTP/SSE Streamable HTTP for MCP | Production deployable, any AI client | ✓ Good |
| Redis for all MCP state (no in-process) | Scales to multi-user cloud deployment | ✓ Good |
| SSE push over WebSocket | Zero infra change, App Router native, MCP spec-first | ✓ Good |
| Plugin tools via frontend relay | worldwideview-only, no engine endpoint, composable | ✓ Good |
| Generic transport-agnostic API keys | One bearer key for MCP + future REST | ✓ Good |
| Marketplace tools deferred to v1.3 | Kept v1.2 worldwideview-only; clean scope | ✓ Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

---
*Last updated: 2026-05-31 after v1.4 milestone start*
