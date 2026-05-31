/**
 * MCP Filter Tool registrar (Phase 23 Wave 2 -- 23-02).
 *
 * Registers three MCP tools that let an AI agent filter the live globe:
 *
 *   set_filter          -- push filter values to a plugin layer (FILT-01)
 *   clear_filter        -- clear one plugin's filters, or all filters (FILT-02)
 *   get_plugin_filters  -- read a plugin's declared filterable fields (FILT-03)
 *
 * set_filter / clear_filter enqueue a GlobeCommand via enqueueGlobeCommand; the
 * browser drains the queue over the SSE bridge and applies them to filterSlice.
 * get_plugin_filters reads the browser-published session catalog (D-05).
 *
 * Security: userId comes ONLY from ctx (the verified auth result). It is never
 * read from tool arguments. sessionId may come from args (scopes the tab) or is
 * resolved from the user's active ZSET entry.
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { enqueueGlobeCommand, resolveActiveSessionId } from "@/lib/globeCommandQueue";
import { readSessionCatalog } from "@/lib/mcpSessionCatalog";
import { filterValueSchema } from "@/lib/mcp/filterSchemas";
import type { GlobeCommand } from "@/core/globe/types/GlobeCommand";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

type McpTextResult = { content: [{ type: "text"; text: string }] };

function textResult(text: string): McpTextResult {
    return { content: [{ type: "text", text }] };
}

const NO_SESSION_RESULT = textResult("no active globe session to control");

/**
 * Resolves the session to use: explicit arg takes precedence, falling back to
 * the most-recently-active session for this user. Returns null if none is live.
 */
async function resolveSession(
    userId: string,
    argSessionId: string | undefined,
): Promise<string | null> {
    if (argSessionId !== undefined && argSessionId !== "") {
        return argSessionId;
    }
    return resolveActiveSessionId(userId);
}

// ---------------------------------------------------------------------------
// Public registrar
// ---------------------------------------------------------------------------

export function registerFilterTools(
    server: McpServer,
    ctx: { userId: string },
): void {
    const { userId } = ctx;

    // TOOL: set_filter (FILT-01)
    server.registerTool(
        "set_filter",
        {
            description:
                "Apply one or more filters to a plugin's live globe layer (no page reload). " +
                "Use after get_plugin_filters to discover valid filter ids; affects the live globe layer, not data query tools. " +
                "Limitations: filter ids are plugin-specific; invalid ids are silently ignored by the browser. " +
                "Parameters: pluginId (string, required); filters (object, required) -- filterId -> { type: 'text', value } | { type: 'select', values } | { type: 'range', min, max } | { type: 'boolean', value }; sessionId (optional). " +
                "Output: 'set_filter command enqueued for <pluginId> (N filter(s))' or 'no active globe session to control'. " +
                "Example: set_filter({ pluginId: 'flights', filters: { status: { type: 'select', values: ['airborne'] } } }).",
            inputSchema: {
                pluginId: z.string().min(1).describe("Plugin whose layer to filter, e.g. 'flights'"),
                filters: z
                    .record(z.string(), filterValueSchema)
                    .describe("Map of filterId -> filter value. Discover valid filter ids via get_plugin_filters."),
                sessionId: z.string().optional().describe("Target globe session id. Omit to target most-recently-active tab."),
            },
        },
        async (args) => {
            try {
                const sessionId = await resolveSession(userId, args.sessionId);
                if (sessionId === null) return NO_SESSION_RESULT;

                const cmd: GlobeCommand = {
                    type: "setFilter",
                    pluginId: args.pluginId,
                    filters: args.filters,
                };
                await enqueueGlobeCommand(userId, sessionId, cmd);
                return textResult(
                    `set_filter command enqueued for '${args.pluginId}' (${Object.keys(args.filters).length} filter(s))`,
                );
            } catch (err) {
                console.error("[filterTools] set_filter failed:", err);
                return textResult("set_filter command failed");
            }
        },
    );

    // TOOL: clear_filter (FILT-02)
    server.registerTool(
        "clear_filter",
        {
            description:
                "Clear active filters on the live globe. " +
                "Prefer clear_filter over re-setting filters to empty values; omit pluginId to clear ALL filters across every plugin at once. " +
                "Limitations: requires an active globe session; returns 'no active globe session to control' when no tab is live. " +
                "Parameters: pluginId (string, optional) -- omit to clear all plugins; sessionId (optional). " +
                "Output: 'clear_filter enqueued for <pluginId>' or 'clear_filter enqueued for ALL plugins'. " +
                "Example: clear_filter({ pluginId: 'flights' }) or clear_filter({}).",
            inputSchema: {
                pluginId: z.string().optional().describe("Plugin whose filters to clear. Omit to clear ALL filters on the globe."),
                sessionId: z.string().optional().describe("Target globe session id. Omit to target most-recently-active tab."),
            },
        },
        async (args) => {
            try {
                const sessionId = await resolveSession(userId, args.sessionId);
                if (sessionId === null) return NO_SESSION_RESULT;

                const cmd: GlobeCommand = {
                    type: "clearFilter",
                    ...(args.pluginId !== undefined && { pluginId: args.pluginId }),
                };
                await enqueueGlobeCommand(userId, sessionId, cmd);
                return textResult(
                    args.pluginId
                        ? `clear_filter enqueued for '${args.pluginId}'`
                        : "clear_filter enqueued for ALL plugins",
                );
            } catch (err) {
                console.error("[filterTools] clear_filter failed:", err);
                return textResult("clear_filter command failed");
            }
        },
    );

    // TOOL: get_plugin_filters (FILT-03)
    server.registerTool(
        "get_plugin_filters",
        {
            description:
                "Read-only discovery: list filterable fields a plugin has declared, so you can build a valid set_filter call. " +
                "Use before set_filter to confirm filter ids and value types for a plugin. " +
                "Limitations: returns [] when the plugin declares no filters or no globe session is active (browser must be open with the plugin loaded). " +
                "Parameters: pluginId (string, required) -- the plugin to inspect. " +
                "Output: JSON array of FilterDefinition, each { id, label, type: 'text'|'select'|'range'|'boolean', propertyKey, options?, range? }. " +
                "Example: get_plugin_filters({ pluginId: 'flights' }) -> [{ id: 'status', label: 'Status', type: 'select', options: [...] }].",
            inputSchema: {
                pluginId: z.string().min(1).describe("Plugin to inspect for declared filterable fields"),
            },
        },
        async (args) => {
            try {
                const sessionId = await resolveActiveSessionId(userId);
                if (!sessionId) return textResult("[]");

                const catalog = await readSessionCatalog(userId, sessionId);
                const defs = catalog?.filterDefinitions?.[args.pluginId] ?? [];
                return textResult(JSON.stringify(defs));
            } catch (err) {
                console.error("[filterTools] get_plugin_filters failed:", err);
                return textResult("[]");
            }
        },
    );
}
