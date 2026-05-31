/**
 * Unit tests for src/lib/mcp/server.ts (Phase 26 -- INST-01..04)
 *
 * Assertions:
 *   1. MCP_SERVER_INSTRUCTIONS contains role-framing header, mental model,
 *      preserved existing sections, and both workflow rules.
 *   2. registerOrientationPrompts registers both "orient-globe" and "investigate".
 *   3. orient-globe callback returns sessions + layers + camera in one message.
 *   4. investigate callback returns step-numbered text with no placeholder tokens.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    MCP_SERVER_INSTRUCTIONS,
    registerOrientationPrompts,
} from "./server";
import {
    readActiveSessions,
    readGlobeState,
} from "@/lib/globeStateStore";

vi.mock("@/lib/globeStateStore", () => ({
    readActiveSessions: vi.fn(),
    readGlobeState: vi.fn(),
}));

const mockReadSessions = vi.mocked(readActiveSessions);
const mockReadState = vi.mocked(readGlobeState);

// ---------------------------------------------------------------------------
// Fake McpServer -- captures registerPrompt calls for assertion.
// ---------------------------------------------------------------------------
function makeFakeServer() {
    const handlers: Record<string, (args: Record<string, unknown>) => unknown> = {};
    return {
        registerPrompt: vi.fn(
            (
                name: string,
                _config: unknown,
                handler: (args: Record<string, unknown>) => unknown,
            ) => {
                handlers[name] = handler;
            },
        ),
        _getHandler: (name: string) => handlers[name],
    };
}

beforeEach(() => {
    vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// 1. MCP_SERVER_INSTRUCTIONS content (INST-01, INST-02)
// ---------------------------------------------------------------------------

describe("MCP_SERVER_INSTRUCTIONS", () => {
    it("is non-empty", () => {
        expect(MCP_SERVER_INSTRUCTIONS.length).toBeGreaterThan(0);
    });

    it("contains role-framing phrase 'geospatial intelligence assistant'", () => {
        expect(MCP_SERVER_INSTRUCTIONS).toContain("geospatial intelligence assistant");
    });

    it("preserves existing CAPABILITIES section", () => {
        expect(MCP_SERVER_INSTRUCTIONS).toContain("CAPABILITIES");
    });

    it("preserves existing COORDINATES section", () => {
        expect(MCP_SERVER_INSTRUCTIONS).toContain("COORDINATES");
    });

    it("preserves existing DATA AVAILABILITY section", () => {
        expect(MCP_SERVER_INSTRUCTIONS).toContain("DATA AVAILABILITY");
    });

    it("contains a MENTAL MODEL section with globe, plugins, and sessions concepts", () => {
        expect(MCP_SERVER_INSTRUCTIONS).toContain("MENTAL MODEL");
        expect(MCP_SERVER_INSTRUCTIONS).toContain("Globe");
        expect(MCP_SERVER_INSTRUCTIONS).toContain("Plugin");
        expect(MCP_SERVER_INSTRUCTIONS).toContain("Session");
    });

    it("Rule 1: contains globe://sessions BEFORE rule for command tools (INST-02)", () => {
        expect(MCP_SERVER_INSTRUCTIONS).toContain("globe://sessions");
        expect(MCP_SERVER_INSTRUCTIONS).toMatch(/Before.*command tool.*globe:\/\/sessions|globe:\/\/sessions.*before.*command/i);
    });

    it("Rule 2: contains tools/list check before querying plugin data (INST-02)", () => {
        expect(MCP_SERVER_INSTRUCTIONS).toContain("tools/list");
        expect(MCP_SERVER_INSTRUCTIONS).toMatch(/tools\/list.*plugin|plugin.*tools\/list/i);
    });
});

// ---------------------------------------------------------------------------
// 2. registerOrientationPrompts -- registration (INST-03, INST-04)
// ---------------------------------------------------------------------------

describe("registerOrientationPrompts -- registration", () => {
    it("registers exactly two prompts", async () => {
        const server = makeFakeServer();
        await registerOrientationPrompts(server as never, { userId: "u1" });
        expect(server.registerPrompt).toHaveBeenCalledTimes(2);
    });

    it("registers 'orient-globe' prompt", async () => {
        const server = makeFakeServer();
        await registerOrientationPrompts(server as never, { userId: "u1" });
        const names = server.registerPrompt.mock.calls.map((c) => c[0]);
        expect(names).toContain("orient-globe");
    });

    it("registers 'investigate' prompt", async () => {
        const server = makeFakeServer();
        await registerOrientationPrompts(server as never, { userId: "u1" });
        const names = server.registerPrompt.mock.calls.map((c) => c[0]);
        expect(names).toContain("investigate");
    });
});

// ---------------------------------------------------------------------------
// 3. orient-globe handler -- sessions + layers + camera in one call (INST-03)
// ---------------------------------------------------------------------------

describe("orient-globe handler", () => {
    it("returns sessions, layers, and camera in one GetPromptResult message", async () => {
        mockReadSessions.mockResolvedValue([
            { sessionId: "sess-abc", lastSeen: Date.now() - 5000 },
        ]);
        mockReadState.mockResolvedValue({
            camera: { lat: 51.5, lon: -0.12, alt: 1000000 },
            layers: { flights: { visible: true } },
        } as never);

        const server = makeFakeServer();
        await registerOrientationPrompts(server as never, { userId: "u1" });

        const handler = server._getHandler("orient-globe");
        expect(handler).toBeDefined();
        const result = await (handler as () => Promise<unknown>)();

        const msg = (result as { messages: Array<{ content: { text: string } }> }).messages[0];
        expect(msg.content.text).toContain("sess-abc");
        expect(msg.content.text).toContain("flights");
        expect(msg.content.text).toContain("51.5");
    });

    it("gracefully handles no active sessions", async () => {
        mockReadSessions.mockResolvedValue([]);

        const server = makeFakeServer();
        await registerOrientationPrompts(server as never, { userId: "u1" });

        const handler = server._getHandler("orient-globe");
        const result = await (handler as () => Promise<unknown>)();

        const msg = (result as { messages: Array<{ content: { text: string } }> }).messages[0];
        expect(msg.content.text).toContain("none");
        expect(mockReadState).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// 4. investigate handler -- step-numbered, no placeholder tokens (INST-04)
// ---------------------------------------------------------------------------

describe("investigate handler", () => {
    it("returns step-numbered content", async () => {
        const server = makeFakeServer();
        await registerOrientationPrompts(server as never, { userId: "u1" });

        const handler = server._getHandler("investigate");
        const result = (handler as (a: Record<string, unknown>) => unknown)({});

        const msg = (result as { messages: Array<{ content: { text: string } }> }).messages[0];
        expect(msg.content.text).toContain("Step 1");
        expect(msg.content.text).toContain("Step 2");
        expect(msg.content.text).toContain("Step 3");
    });

    it("contains no TODO or placeholder tokens", async () => {
        const server = makeFakeServer();
        await registerOrientationPrompts(server as never, { userId: "u1" });

        const handler = server._getHandler("investigate");
        const result = (handler as (a: Record<string, unknown>) => unknown)({});

        const text = (result as { messages: Array<{ content: { text: string } }> }).messages[0]
            .content.text;
        expect(text).not.toContain("TODO");
        expect(text).not.toContain("FIXME");
        expect(text).not.toMatch(/<\.\.\.>/);
        expect(text).not.toContain("[placeholder]");
    });

    it("weaves the place name into the steps when provided", async () => {
        const server = makeFakeServer();
        await registerOrientationPrompts(server as never, { userId: "u1" });

        const handler = server._getHandler("investigate");
        const result = (handler as (a: Record<string, unknown>) => unknown)({
            place: "Tokyo",
        });

        const text = (result as { messages: Array<{ content: { text: string } }> }).messages[0]
            .content.text;
        expect(text).toContain("Tokyo");
    });

    it("includes geocode and tools/list steps in the workflow", async () => {
        const server = makeFakeServer();
        await registerOrientationPrompts(server as never, { userId: "u1" });

        const handler = server._getHandler("investigate");
        const result = (handler as (a: Record<string, unknown>) => unknown)({});

        const text = (result as { messages: Array<{ content: { text: string } }> }).messages[0]
            .content.text;
        expect(text).toContain("geocode");
        expect(text).toContain("tools/list");
    });
});
