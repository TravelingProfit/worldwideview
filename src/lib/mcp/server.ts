/**
 * MCP server factory -- Phase 17 (Stateless Streamable HTTP transport)
 *
 * createMcpServer() returns a FRESH McpServer instance on every call.
 * It is the single aggregation point where future phases register their
 * capabilities:
 *
 *   Phase 18 -- registerGlobeResources(server, { userId })   -> globe:// resources
 *   Phase 19 -- registerGlobeCommandTools(server, { userId }) -> globe control tools
 *   Phase 20 -- registerDataQueryTools(server, { userId })    -> data query tools
 *   Phase 21 -- dynamic per-plugin tools merged into tools/list
 *
 * Those registrars are NOT called here -- Phase 17 ships the transport only.
 * Each feature phase calls its own registrar from src/app/api/mcp/route.ts
 * AFTER createMcpServer() returns, passing { userId } via closure injection
 * (per RECONCILIATION R-1).
 *
 * Stateless invariant (D-17-04): never cache this instance. A fresh server
 * is created per request so no session state or transport binding leaks
 * between concurrent requests.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readActiveSessions, readGlobeState } from "@/lib/globeStateStore";

const SERVER_NAME = "worldwideview" as const;

// The MCP server's own protocol-advertised version. Bump this when the
// server's self-description or tool surface changes in a meaningful way.
// This is NOT package.json -- do not keep them in sync automatically.
export const MCP_SERVER_VERSION = "1.3.0" as const;

export const MCP_SERVER_INSTRUCTIONS = `\
You are a geospatial intelligence assistant connected to WorldWideView -- a live 3D globe that streams real-world data in real time. You control the globe and query its data on behalf of the authenticated user. All state is scoped to your API key: you only ever see and control your own sessions and data.

MENTAL MODEL
- Globe: a 3D interactive viewer running in the user's browser. Think of it as a live map you can steer.
- Plugins: data layers loaded onto the globe (e.g. flights, earthquakes, shipping). Each plugin streams its own live data.
- Sessions: open browser tabs showing the globe. Each tab is an independent session identified by a UUID.

CAPABILITIES
- Globe command tools (write/steer a live browser tab): pan_globe, focus_entity, toggle_layer, set_timeline.
- Data query tools (read shared engine data): search_entities, get_entities_in_region, get_entity_details, get_plugin_data.
- Resources (read): globe://sessions, globe://state/{sessionId}, globe://layers.
- Plugin tools (dynamic): extra tools named "<pluginId>__<toolName>" appear only after a browser tab has loaded that plugin and published its catalog. Re-call tools/list after the relevant plugin is loaded.

WORKFLOWS (follow these sequences -- order matters)
Rule 1 -- Before any command tool (pan_globe, toggle_layer, focus_entity, set_timeline): READ globe://sessions first to discover active sessions and their sessionIds. Calling a command without knowing the active session may target the wrong tab or fail silently.
Rule 2 -- Before calling get_plugin_data or get_entities_in_region for a specific plugin: CHECK tools/list for "<pluginId>__<toolName>" entries first. Plugin tools only appear after the relevant browser tab has loaded that plugin. If the tool is not listed, the plugin is not active yet.
Rule 3 -- Before calling fly_to or focus_entity for a named place: GEOCODE the place name first using the geocode tool to obtain precise coordinates. Do not guess lat/lon values.

SESSIONS (read before using any command tool)
- A session is one open browser tab showing the globe, identified by a UUID sessionId.
- To discover sessions, READ the resource globe://sessions. It returns the tabs active in the last ~45 seconds; a tab that goes quiet drops off the list.
- Every command tool takes an optional sessionId. Omit it to target your most-recently-active tab. Pass a sessionId from globe://sessions to target one specific tab. Commands are isolated per session and are never broadcast to other tabs.
- To see what a specific tab currently shows (camera, layers, timeline), read globe://state/{sessionId}.
- If no tab is active, command tools return "no active globe session to control" -- the user must open the app in a browser first.

COORDINATES
- latitude must be in [-90, 90], longitude in [-180, 180], altitude greater than 0 metres. Out-of-range values are rejected with a validation error.

DATA AVAILABILITY
- Data query tools return {"success": true, "entities": [], "count": 0} when nothing matches OR when the live data engine is not currently feeding that plugin. An empty result is normal, not an error.`;

/**
 * Returns a fresh, empty-capability McpServer per call.
 *
 * STATELESS (D-17-04): never cache this instance; a fresh server is created
 * per request. Do NOT hoist the return value to module scope.
 */
export function createMcpServer(): McpServer {
    return new McpServer(
        { name: SERVER_NAME, version: MCP_SERVER_VERSION },
        {
            instructions: MCP_SERVER_INSTRUCTIONS,
            capabilities: {
                // tools.listChanged: required so Phase 21 can push live tool
                // list updates to clients (RECONCILIATION R-1).
                tools: { listChanged: true },
            },
        },
    );
}

// ---------------------------------------------------------------------------
// Phase 26: Orientation prompts (INST-03, INST-04)
// ---------------------------------------------------------------------------

/**
 * Registers orientation prompts that give a fresh agent immediate context
 * about the current globe state and canonical investigation workflows.
 *
 * orient-globe: returns active sessions + loaded layers + camera state in
 *   one call so the agent is ready to issue command tools without extra reads.
 *
 * investigate: returns a static step-numbered workflow for investigating a
 *   named place on the globe (geocode -> check plugins -> fly -> query).
 */
export async function registerOrientationPrompts(
    server: McpServer,
    { userId }: { userId: string },
): Promise<void> {
    // orient-globe: no args -- returns a snapshot of the current globe state.
    server.registerPrompt(
        "orient-globe",
        {
            title: "Orient Globe",
            description:
                "Returns active globe sessions, loaded layers, and camera state in one call. " +
                "Call this first so you know which sessions exist and what each tab is showing " +
                "before issuing any command tool.",
        },
        async () => {
            const sessions = await readActiveSessions(userId);

            if (sessions.length === 0) {
                return {
                    messages: [
                        {
                            role: "user" as const,
                            content: {
                                type: "text" as const,
                                text: [
                                    "GLOBE ORIENTATION",
                                    "",
                                    "Active sessions: none",
                                    "",
                                    "No browser tab is currently showing the globe. " +
                                        "Ask the user to open the WorldWideView app in a browser first, " +
                                        "then call orient-globe again.",
                                    "",
                                    "Loaded layers: none",
                                    "Camera state: none",
                                ].join("\n"),
                            },
                        },
                    ],
                };
            }

            const mostRecent = sessions[0];
            const snapshot = await readGlobeState(userId, mostRecent.sessionId);

            const sessionLines = sessions.map(
                (s, i) =>
                    `  ${i + 1}. sessionId=${s.sessionId} (last seen ${Math.round((Date.now() - s.lastSeen) / 1000)}s ago)`,
            );

            const layers = snapshot?.layers ?? {};
            const layerKeys = Object.keys(layers);
            const layerLines =
                layerKeys.length > 0
                    ? layerKeys.map((k) => `  - ${k}: ${JSON.stringify(layers[k])}`)
                    : ["  none"];

            const camera = snapshot
                ? [
                      `  latitude:  ${snapshot.camera?.lat ?? "unknown"}`,
                      `  longitude: ${snapshot.camera?.lon ?? "unknown"}`,
                      `  altitude:  ${snapshot.camera?.alt ?? "unknown"} m`,
                  ]
                : ["  unknown (no snapshot available)"];

            const text = [
                "GLOBE ORIENTATION",
                "",
                `Active sessions (${sessions.length}):`,
                ...sessionLines,
                "",
                `Most-recent session: ${mostRecent.sessionId}`,
                "",
                "Loaded layers:",
                ...layerLines,
                "",
                "Camera state:",
                ...camera,
            ].join("\n");

            return {
                messages: [
                    {
                        role: "user" as const,
                        content: { type: "text" as const, text },
                    },
                ],
            };
        },
    );

    // investigate: optional place arg -- returns a step-numbered workflow.
    server.registerPrompt(
        "investigate",
        {
            title: "Investigate a Place",
            description:
                "Returns a step-numbered workflow for investigating a named place on the globe. " +
                "Covers geocoding, plugin availability check, camera navigation, layer toggling, " +
                "and entity querying. Provide a place name for a tailored guide, or omit for the generic template.",
            argsSchema: { place: z.string().optional() },
        },
        ({ place }: { place?: string }) => {
            const target = place ?? "the place of interest";
            const text = [
                `INVESTIGATION WORKFLOW${place ? `: ${place.toUpperCase()}` : ""}`,
                "",
                `Step 1 -- Geocode the target`,
                `  Call: geocode({ query: "${target}" })`,
                `  Result: latitude, longitude, display name.`,
                `  Stop if no result is returned -- the place name may be misspelled or too ambiguous.`,
                "",
                `Step 2 -- Check plugin availability`,
                `  Call: tools/list`,
                `  Look for "<pluginId>__<toolName>" entries relevant to your investigation.`,
                `  If the tools you need are absent, ask the user to load the relevant plugin in their browser tab, then re-call tools/list.`,
                "",
                `Step 3 -- Orient the globe`,
                `  Call: orient-globe (this prompt) or READ globe://sessions to find the active sessionId.`,
                `  Then call: pan_globe({ lat, lon, alt: 500000 }) to fly to the geocoded coordinates.`,
                "",
                `Step 4 -- Toggle relevant layers`,
                `  Call: toggle_layer({ pluginId: "<pluginId>", visible: true }) for each plugin relevant to your query.`,
                `  Wait a moment for the plugin to stream data before querying.`,
                "",
                `Step 5 -- Query entities in the region`,
                `  Call: get_entities_in_region({ lat, lon, radiusKm: 50 }) or the plugin-specific tool if available.`,
                `  An empty result means the plugin is not streaming data for this region right now -- that is normal.`,
                "",
                `Step 6 -- Drill into specific entities`,
                `  Call: get_entity_details({ entityId: "<id>" }) for any entity of interest.`,
                `  Call: focus_entity({ entityId: "<id>" }) to centre the camera on it.`,
            ].join("\n");

            return {
                messages: [
                    {
                        role: "user" as const,
                        content: { type: "text" as const, text },
                    },
                ],
            };
        },
    );
}
