/**
 * DEPLOY-03: Global Nominatim throttle tests.
 *
 * Verifies that:
 *   - fetchGeocode calls redisSlidingWindowPeek to poll and redisSlidingWindow
 *     to commit (only one committing ZADD per request)
 *   - when the slot is available immediately, the fetch proceeds
 *   - when Redis fails open (allowed:true), the fetch still proceeds
 *   - the peek loop retries until a slot opens, then commits exactly once
 *   - proceeds after the deadline even if the slot never opens (no indefinite blocking)
 *   - returns empty array immediately when the queue-depth cap is exceeded
 *   - the 24h cache in geocodingTools.ts is checked BEFORE fetchGeocode (caller
 *     responsibility; this file only tests fetchGeocode itself)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Must mock before importing the module under test so the import picks up the mock.
vi.mock("@/lib/geocodingRateLimit");
vi.mock("@/lib/redis");

import { fetchGeocode } from "./nominatim";
import { redisSlidingWindow, redisSlidingWindowPeek } from "@/lib/geocodingRateLimit";

const mockRedisSlidingWindow = vi.mocked(redisSlidingWindow);
const mockRedisSlidingWindowPeek = vi.mocked(redisSlidingWindowPeek);

const MOCK_ITEMS = [
    {
        lat: "48.8566",
        lon: "2.3522",
        name: "Paris",
        display_name: "Paris, France",
        type: "city",
        addresstype: "city",
        importance: 0.9,
        boundingbox: ["48.815", "48.902", "2.224", "2.470"] as [string, string, string, string],
    },
];

function mockFetch(items: unknown[] = MOCK_ITEMS): void {
    global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => items,
    } as unknown as Response);
}

beforeEach(() => {
    vi.clearAllMocks();
    // Default: slot is immediately available (peek returns count 0 = slot free).
    mockRedisSlidingWindowPeek.mockResolvedValue({ count: 0, retryAfterMs: 0 });
    // Committing call also succeeds.
    mockRedisSlidingWindow.mockResolvedValue({ allowed: true, retryAfterMs: 0 });
    mockFetch();
});

describe("fetchGeocode global throttle (DEPLOY-03)", () => {
    it("calls redisSlidingWindowPeek with the nominatim:global key before fetching", async () => {
        await fetchGeocode({ query: "Paris", limit: 5 });

        expect(mockRedisSlidingWindowPeek).toHaveBeenCalledWith("nominatim:global", 1000);
    });

    it("calls redisSlidingWindow exactly once to commit the slot when slot is available", async () => {
        await fetchGeocode({ query: "Paris", limit: 5 });

        // Only one committing add, regardless of how many peek iterations occurred.
        expect(mockRedisSlidingWindow).toHaveBeenCalledTimes(1);
        expect(mockRedisSlidingWindow).toHaveBeenCalledWith("nominatim:global", 1, 1000);
    });

    it("proceeds to fetch when slot is immediately available", async () => {
        mockRedisSlidingWindowPeek.mockResolvedValue({ count: 0, retryAfterMs: 0 });

        const result = await fetchGeocode({ query: "Paris", limit: 5 });

        expect(global.fetch).toHaveBeenCalledOnce();
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe("Paris");
    });

    it("peeks multiple times before committing when slot is initially occupied", async () => {
        // First peek: slot occupied; second peek: slot free.
        mockRedisSlidingWindowPeek
            .mockResolvedValueOnce({ count: 1, retryAfterMs: 10 })
            .mockResolvedValue({ count: 0, retryAfterMs: 0 });

        const result = await fetchGeocode({ query: "Tokyo", limit: 2 });

        expect(mockRedisSlidingWindowPeek).toHaveBeenCalledTimes(2);
        // Exactly one commit, after the slot opened.
        expect(mockRedisSlidingWindow).toHaveBeenCalledTimes(1);
        expect(global.fetch).toHaveBeenCalledOnce();
        expect(result).toHaveLength(1);
    });

    it("does NOT call redisSlidingWindow during peek-wait iterations (no slot-burn)", async () => {
        // Slot occupied for two polls, then opens.
        mockRedisSlidingWindowPeek
            .mockResolvedValueOnce({ count: 1, retryAfterMs: 10 })
            .mockResolvedValueOnce({ count: 1, retryAfterMs: 10 })
            .mockResolvedValue({ count: 0, retryAfterMs: 0 });

        await fetchGeocode({ query: "Berlin", limit: 1 });

        // redisSlidingWindow is the committing write. It must be called exactly once,
        // not once per peek iteration.
        expect(mockRedisSlidingWindow).toHaveBeenCalledTimes(1);
    });

    it("proceeds after deadline even if slot never opens (no indefinite blocking)", async () => {
        // Always occupied. fetchGeocode must resolve within a reasonable time.
        mockRedisSlidingWindowPeek.mockResolvedValue({ count: 1, retryAfterMs: 50 });

        const start = Date.now();
        const result = await fetchGeocode({ query: "London", limit: 1 });
        const elapsed = Date.now() - start;

        expect(global.fetch).toHaveBeenCalledOnce();
        expect(result).toHaveLength(1);
        // Must resolve after the deadline (~1100ms) but well under 3 seconds.
        expect(elapsed).toBeLessThan(3_000);
    }, 6_000);

    it("returns empty array immediately when the queue-depth cap is exceeded", async () => {
        // Slot always occupied so _activeWaiters would accumulate.
        // We test the cap by checking that after 10 concurrent pending calls,
        // additional calls return [] without hanging.
        // Since we cannot truly run 10 concurrent async calls here, we simulate
        // by checking the exported behavior: if _activeWaiters >= 10 the function
        // returns [] without fetching.
        // We use a slow peek (10ms delay) to give concurrent calls time to queue up.
        let resolveFirst: () => void;
        const firstPeekGate = new Promise<void>((res) => { resolveFirst = res; });

        mockRedisSlidingWindowPeek.mockImplementation(async () => {
            await firstPeekGate;
            return { count: 0, retryAfterMs: 0 };
        });

        // Start 11 calls. The first 10 block on the gate; the 11th should return [].
        const calls = Array.from({ length: 11 }, (_, i) =>
            fetchGeocode({ query: `city${i}`, limit: 1 }),
        );

        // Give the calls time to queue up before releasing the gate.
        await new Promise<void>((res) => setTimeout(res, 20));

        // Release all blocked callers.
        resolveFirst!();

        const results = await Promise.all(calls);
        const emptyResults = results.filter((r) => r.length === 0);
        // At least one call was shed (the 11th or beyond the cap).
        expect(emptyResults.length).toBeGreaterThanOrEqual(1);
    });

    it("still fetches when redisSlidingWindow fails open (Redis error returns allowed:true)", async () => {
        // redisSlidingWindow already handles Redis errors internally and returns allowed:true.
        mockRedisSlidingWindow.mockResolvedValue({ allowed: true, retryAfterMs: 0 });

        const result = await fetchGeocode({ query: "Berlin", limit: 3 });

        expect(global.fetch).toHaveBeenCalledOnce();
        expect(result).toHaveLength(1);
    });

    it("returns empty array when Nominatim returns non-array JSON", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ error: "bad query" }),
        } as unknown as Response);

        const result = await fetchGeocode({ query: "!!!invalid", limit: 1 });
        expect(result).toEqual([]);
    });

    it("throws when Nominatim returns a non-OK HTTP status", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 429,
        } as unknown as Response);

        await expect(fetchGeocode({ query: "Paris", limit: 5 })).rejects.toThrow("HTTP 429");
    });

    it("injects query via URLSearchParams (not string concatenation)", async () => {
        await fetchGeocode({ query: "Paris & Rome", limit: 1 });

        const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as URL;
        expect(calledUrl.searchParams.get("q")).toBe("Paris & Rome");
    });
});
