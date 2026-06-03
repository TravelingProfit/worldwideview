/**
 * Shared MCP tool-description fragments.
 *
 * SESSION_REQUIRED_PREAMBLE is prepended to every command/control tool
 * description so the live-open-tab requirement (ONBRD-03) is stated identically
 * everywhere. Command tools enqueue to a per-session Redis queue that only a
 * live, signed-in browser tab drains; without an open tab the command is
 * accepted but has no visible effect.
 */
export const SESSION_REQUIRED_PREAMBLE =
    "Requires a live, signed-in WorldWideView browser tab; without an open globe tab the command is accepted but has no visible effect. ";
