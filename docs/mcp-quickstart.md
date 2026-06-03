# MCP Quickstart: Connect an AI Agent to WorldWideView

Connect Claude Desktop, Cursor, or any MCP-compatible client to WorldWideView in under five minutes.

---

## Prerequisites

- A WorldWideView account on the **cloud edition** (`worldmonitor.app`). MCP is a cloud-edition feature; it is not available on the demo edition.
- A personal API key (generated in step 2 below).
- An MCP-compatible client: Claude Desktop, Cursor, VS Code with an MCP extension, or any client that supports the Streamable HTTP MCP transport.

---

## Step 1: Sign up or sign in

Open [worldmonitor.app](https://worldmonitor.app) and sign in. If you do not have an account, register one first.

---

## Step 2: Generate a personal API key

1. In the app header, open **Settings** and navigate to **API and MCP Access**.
2. Click **Generate new key** and give it a name (e.g. "Claude Desktop").
3. **Copy the key immediately.** It is shown only once. If you lose it, revoke it and generate a new one.

Your key looks like: `wwv_abc123.<long-secret>`

---

## Step 3: Add the MCP server to your client

Paste the following block into your client's MCP configuration file (e.g. `claude_desktop_config.json` for Claude Desktop, or the Cursor MCP settings):

```json
{
  "mcpServers": {
    "worldwideview": {
      "url": "https://api.worldmonitor.app/api/mcp",
      "headers": {
        "Authorization": "Bearer wwv_<your-key-here>"
      }
    }
  }
}
```

Replace `wwv_<your-key-here>` with the key you copied in step 2.

**Security note:** the key goes in the `Authorization` header, never in the URL.

---

## Step 4: Restart your client and verify

Restart your MCP client (Claude Desktop requires a full app restart; Cursor reloads automatically). Ask the agent: "List the available WorldWideView plugins" -- it should call `list_available_plugins` and return results. If `list_available_plugins` returns `"engine_unreachable"` or `"no_active_plugins"`, the MCP connection is working but the data engine is down or idle -- see Troubleshooting below.

---

## Two capability tiers

WorldWideView MCP tools split into two tiers based on whether a browser globe session is required.

### Read / query tools (no open tab required)

These run server-side and return live data using only your API key. You do not need to have the globe open.

| Tool | What it does |
|---|---|
| `search_entities` | Search entities by name across active plugins |
| `get_entities_in_region` | Find entities inside a lat/lng bounding box |
| `get_entity_details` | Get full details for one entity |
| `get_plugin_data` | Get the current snapshot of all entities for a plugin |
| `list_available_plugins` | List streaming plugins and their status |
| `geocode_location` | Resolve a place name or address to coordinates |
| `save_favorite` | Bookmark an entity |
| `list_favorites` | List your bookmarks |
| `remove_favorite` | Delete a bookmark |
| `update_favorite` | Rename or annotate a bookmark |
| `get_plugin_filters` | List filterable fields a plugin declares |

### Command / control tools (open globe tab required)

These tools control the live 3D globe running in your browser. **You must keep a WorldWideView browser tab open and signed in as the same account.** Without an open tab, the command is accepted but has no visible effect and the tool returns `"no active globe session to control"`.

| Tool | What it does |
|---|---|
| `pan_globe` | Fly the camera to a coordinate |
| `fly_to` | Fly the camera to a geocoded coordinate or bounding box |
| `focus_entity` | Centre the camera on a known entity |
| `toggle_layer` | Enable or disable a plugin data layer |
| `set_timeline` | Set playback time, window, or mode |
| `set_filter` | Apply filters to a plugin's live layer |
| `clear_filter` | Clear filters on one or all plugins |

---

## Recommended agent prompt

Paste this into your agent's system prompt to give it immediate context about what WorldWideView can do:

```
You have access to WorldWideView (WWV) via MCP -- a live 3D globe streaming real-world data
(aviation, shipping, earthquakes, weather, and more). Use the MCP tools to query entities,
move the camera, toggle layers, and filter data. Command tools require the user to have the
WWV globe open in a browser tab. Read/query tools work without a browser tab.
```

---

## Troubleshooting

**"no active globe session to control"**
A command tool (pan_globe, fly_to, toggle_layer, etc.) ran but no globe tab is open. Open [worldmonitor.app](https://worldmonitor.app) in a browser tab, sign in, and try again. The tab must stay open while you use the agent.

**"engine_unreachable" from list_available_plugins**
The data engine is temporarily down. Try again in a moment.

**"no_active_plugins" from list_available_plugins**
The data engine is up but no plugins are currently streaming. Enable a plugin from the Plugins panel in the globe app.

**401 Unauthorized**
Your API key is invalid or has been revoked. Generate a new key in Settings > API and MCP Access.

**Tools do not appear in my client**
Restart the client after editing the config file. For Claude Desktop, a full app quit-and-relaunch is required.

---

## Next steps

- See [plugin-filter-guide.md](plugin-filter-guide.md) to learn how to use `get_plugin_filters` and `set_filter` to filter live plugin data.
- See [plugin-quickstart.md](plugin-quickstart.md) to build your own data plugin.
