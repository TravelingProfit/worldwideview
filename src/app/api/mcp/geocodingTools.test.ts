import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/nominatim", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/nominatim")>();
    return {
        ...actual,
        fetchGeocode: vi.fn(),
    };
});
vi.mock("@/lib/geocodingRateLimit");
vi.mock("@/lib/globeCommandQueue");

import { registerGeocodingTools } from "./geocodingTools";
import { fetchGeocode } from "@/lib/nominatim";
import { checkRateLimit } from "@/lib/geocodingRateLimit";
import { enqueueGlobeCommand, resolveActiveSessionId } from "@/lib/globeCommandQueue";

const mockFetchGeocode = vi.mocked(fetchGeocode);
const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockEnqueueGlobeCommand = vi.mocked(enqueueGlobeCommand);
const mockResolveActiveSessionId = vi.mocked(resolveActiveSessionId);

const handlers: Record<string, (args: unknown) => unknown> = {};
const schemas: Record<string, { description: string }> = {};
const mockServer = {
    registerTool: vi.fn((name: string, schema: { description: string }, handler: (args: unknown) => unknown) => {
        handlers[name] = handler;
        schemas[name] = schema;
    }),
};

const ctx = { userId: "u1" };

beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(handlers).forEach((k) => delete handlers[k]);
    Object.keys(schemas).forEach((k) => delete schemas[k]);
    registerGeocodingTools(mockServer as never, ctx);
});

describe("geocode_location tool handler", () => {
    it("returns structured result with lat/lng/name/bbox/importance when Nominatim returns results", async () => {
        mockCheckRateLimit.mockResolvedValue(undefined);
        mockFetchGeocode.mockResolvedValue([
            {
                lat: "51.5074",
                lon: "-0.1278",
                display_name: "London, UK",
                boundingbox: ["51.2868", "51.6919", "-0.5103", "0.3340"],
                importance: 0.9,
            },
        ]);

        const result = await handlers["geocode_location"]({ query: "London", limit: 1 });

        expect(result).toMatchObject({
            content: expect.arrayContaining([
                expect.objectContaining({ type: "text" }),
            ]),
        });
        const text = (result as { content: Array<{ text: string }> }).content[0].text;
        const parsed = JSON.parse(text);
        expect(parsed[0]).toMatchObject({ lat: expect.any(Number), lng: expect.any(Number), name: expect.any(String) });
        expect(parsed[0]).toHaveProperty("bbox");
        expect(parsed[0]).toHaveProperty("importance");
    });

    it("returns 'no results' message when Nominatim returns empty array", async () => {
        mockCheckRateLimit.mockResolvedValue(undefined);
        mockFetchGeocode.mockResolvedValue([]);

        const result = await handlers["geocode_location"]({ query: "xyznonexistent" });

        const text = (result as { content: Array<{ text: string }> }).content[0].text;
        expect(text.toLowerCase()).toContain("no results");
    });

    it("returns 'rate_limited' when checkRateLimit signals limit exceeded", async () => {
        mockCheckRateLimit.mockResolvedValue({ error: "rate_limited", retryAfterMs: 1000 });

        const result = await handlers["geocode_location"]({ query: "Paris" });

        const text = (result as { content: Array<{ text: string }> }).content[0].text;
        expect(text).toContain("rate_limited");
    });

    it("clamps default limit to 5 and max limit to 20", async () => {
        mockCheckRateLimit.mockResolvedValue(undefined);
        mockFetchGeocode.mockResolvedValue([]);

        await handlers["geocode_location"]({ query: "test" });
        expect(mockFetchGeocode).toHaveBeenCalledWith(expect.objectContaining({ limit: 5 }));

        await handlers["geocode_location"]({ query: "test", limit: 100 });
        expect(mockFetchGeocode).toHaveBeenCalledWith(expect.objectContaining({ limit: 20 }));
    });
});

describe("geocodingTools tool descriptions (DESC-03)", () => {
    const toolNames = ["geocode_location", "fly_to"];

    it.each(toolNames)("%s description is non-empty and within 1024 chars", (name) => {
        const desc = schemas[name].description;
        expect(desc.length).toBeGreaterThan(0);
        expect(desc.length).toBeLessThanOrEqual(1024);
    });

    it.each(toolNames)("%s description contains 'Example:'", (name) => {
        expect(schemas[name].description).toContain("Example:");
    });

    it("fly_to description contains globe://sessions precondition", () => {
        expect(schemas["fly_to"].description).toContain("globe://sessions");
    });

    it("fly_to description contains no-session outcome", () => {
        expect(schemas["fly_to"].description).toContain("no active globe session to control");
    });

    it("fly_to description contains Prefer disambiguation", () => {
        expect(schemas["fly_to"].description).toContain("Prefer");
    });
});

describe("fly_to tool handler", () => {
    it("calls enqueueGlobeCommand with flyTo command for valid lat/lng", async () => {
        mockResolveActiveSessionId.mockResolvedValue("sess-abc");
        mockEnqueueGlobeCommand.mockResolvedValue(undefined);

        await handlers["fly_to"]({ lat: 51.5, lng: -0.1 });

        expect(mockEnqueueGlobeCommand).toHaveBeenCalledWith(
            "u1",
            "sess-abc",
            expect.objectContaining({ type: "flyTo", lat: 51.5, lng: -0.1 }),
        );
    });

    it("returns NO_SESSION_RESULT text when no active session exists", async () => {
        mockResolveActiveSessionId.mockResolvedValue(null);

        const result = await handlers["fly_to"]({ lat: 51.5, lng: -0.1 });

        const text = (result as { content: Array<{ text: string }> }).content[0].text;
        expect(text).toMatch(/no.*(session|globe)/i);
    });

    it("includes bbox in enqueueGlobeCommand call when bbox is provided", async () => {
        mockResolveActiveSessionId.mockResolvedValue("sess-abc");
        mockEnqueueGlobeCommand.mockResolvedValue(undefined);

        await handlers["fly_to"]({ lat: 51.5, lng: -0.1, bbox: [-1, 50, 1, 52] });

        expect(mockEnqueueGlobeCommand).toHaveBeenCalledWith(
            "u1",
            "sess-abc",
            expect.objectContaining({ bbox: [-1, 50, 1, 52] }),
        );
    });
});
