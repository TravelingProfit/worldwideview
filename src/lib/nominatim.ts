/**
 * Nominatim geocoding HTTP wrapper (Phase 22 Wave 2, 22-02).
 *
 * Wraps the public OpenStreetMap Nominatim /search endpoint. The query is the
 * only user-controlled value and is injected exclusively via URLSearchParams
 * (no string concatenation into the URL) to prevent SSRF / parameter injection.
 * The base URL and header values are hardcoded constants.
 *
 * fetchGeocode returns the RAW Nominatim items; callers normalize them via
 * normalizeNominatimResult to the public NominatimResult shape (D-06).
 * Nominatim returns boundingbox as ["south_lat","north_lat","west_lon","east_lon"]
 * (strings); the normalizer remaps to [west, south, east, north] numbers.
 *
 * DEPLOY-03: A single GLOBAL throttle (max 1 req/s across all users) is applied
 * immediately before the outbound fetch. This respects OSM's 1 req/s policy
 * regardless of how many concurrent users are geocoding. The 24h cache (in
 * geocodingTools.ts) is checked by callers BEFORE calling fetchGeocode, so
 * cache hits never touch the throttle.
 *
 * Throttle strategy: Redis-backed sliding window (key "nominatim:global", limit 1,
 * window 1000ms). On Redis failure, falls back to an in-process last-call gate
 * enforcing >=1s spacing. If the window is already consumed, the call waits up
 * to GLOBAL_THROTTLE_MAX_WAIT_MS then proceeds (so a single user is not rejected
 * for transient global contention, just briefly delayed).
 *
 * Slot-burn fix: the wait loop uses redisSlidingWindowPeek (read-only count)
 * rather than redisSlidingWindow (write + count) so only ONE committing ZADD
 * is performed per outbound request, regardless of how many poll iterations
 * occur while waiting.
 *
 * Queue-depth cap: if GLOBAL_THROTTLE_MAX_WAITERS or more callers are already
 * queued inside waitForGlobalSlot, additional callers receive an immediate
 * "geocoder busy" empty result rather than joining a growing pile of waiters.
 * This caps worst-case memory and OSM burst surface under concurrency spikes.
 */

import { redisSlidingWindow, redisSlidingWindowPeek } from "@/lib/geocodingRateLimit";

const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "WorldWideView-MCP/1.3 (contact@worldwideview.app)";
const REQUEST_TIMEOUT_MS = 8_000;

/** Redis key for the global 1 req/s Nominatim throttle. */
const GLOBAL_THROTTLE_KEY = "nominatim:global";
const GLOBAL_THROTTLE_WINDOW_MS = 1_000;
const GLOBAL_THROTTLE_LIMIT = 1;
/** Maximum time (ms) fetchGeocode will wait for a global slot before proceeding. */
const GLOBAL_THROTTLE_MAX_WAIT_MS = 1_100;
/** Maximum concurrent callers allowed inside waitForGlobalSlot at once. */
const GLOBAL_THROTTLE_MAX_WAITERS = 10;

/**
 * In-process fallback gate used when Redis is unreachable.
 * Tracks the timestamp of the last outbound Nominatim request and enforces
 * at least GLOBAL_THROTTLE_WINDOW_MS spacing, preventing an unthrottled
 * burst toward OSM if Redis goes down.
 */
let _lastNominatimCallMs = 0;

/** Current number of callers waiting inside waitForGlobalSlot. */
let _activeWaiters = 0;

/**
 * Wait until the global 1 req/s slot is available, then claim it with a
 * single committing redisSlidingWindow call.
 *
 * The poll loop uses redisSlidingWindowPeek (read-only) so each iteration
 * does NOT add to the ZSET. Only the final claim adds one entry.
 *
 * Waits at most GLOBAL_THROTTLE_MAX_WAIT_MS before proceeding regardless,
 * so a single user's request is not hung for a long time during contention.
 */
async function waitForGlobalSlot(): Promise<void> {
    const deadline = Date.now() + GLOBAL_THROTTLE_MAX_WAIT_MS;

    for (;;) {
        // Peek at the current occupancy without writing to the ZSET.
        const peek = await redisSlidingWindowPeek(GLOBAL_THROTTLE_KEY, GLOBAL_THROTTLE_WINDOW_MS);

        if (peek.count < GLOBAL_THROTTLE_LIMIT) {
            // Slot available: commit the single add and return.
            await redisSlidingWindow(GLOBAL_THROTTLE_KEY, GLOBAL_THROTTLE_LIMIT, GLOBAL_THROTTLE_WINDOW_MS);
            _lastNominatimCallMs = Date.now();
            return;
        }

        const remaining = deadline - Date.now();
        if (remaining <= 0) {
            // Deadline reached. Proceed without a Redis commit so we do not
            // write to a window that is already full.
            _lastNominatimCallMs = Date.now();
            return;
        }

        const waitMs = Math.min(peek.retryAfterMs, remaining, GLOBAL_THROTTLE_WINDOW_MS);
        await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    }
}

/**
 * In-process fallback gate: enforces >= GLOBAL_THROTTLE_WINDOW_MS between
 * outbound Nominatim calls when Redis is unavailable.
 */
async function inProcessGate(): Promise<void> {
    const elapsed = Date.now() - _lastNominatimCallMs;
    if (elapsed < GLOBAL_THROTTLE_WINDOW_MS) {
        await new Promise<void>((resolve) =>
            setTimeout(resolve, GLOBAL_THROTTLE_WINDOW_MS - elapsed),
        );
    }
    _lastNominatimCallMs = Date.now();
}

/** Raw Nominatim /search response item shape. */
export interface RawNominatimItem {
    lat?: string;
    lon?: string;
    name?: string;
    type?: string;
    addresstype?: string;
    display_name?: string;
    boundingbox?: [string, string, string, string];
    importance?: number;
    namedetails?: Record<string, string> | null;
    address?: { country?: string } | null;
}

/** Public, normalized geocode result (D-06). */
export interface NominatimResult {
    lat: number;
    lng: number;
    name: string;
    name_en: string;
    type: string;
    addresstype: string;
    country: string;
    display_name: string;
    /** [west, south, east, north] */
    bbox: [number, number, number, number];
    importance: number;
}

export interface FetchGeocodeArgs {
    query: string;
    limit: number;
}

/** Normalize a raw Nominatim item to the public NominatimResult shape (D-06). */
export function normalizeNominatimResult(r: RawNominatimItem): NominatimResult {
    const bb = r.boundingbox ?? ["0", "0", "0", "0"];
    return {
        lat: parseFloat(r.lat ?? "0"),
        lng: parseFloat(r.lon ?? "0"),
        name: r.name ?? "",
        name_en: r.namedetails?.["name:en"] ?? r.name ?? "",
        type: r.type ?? "",
        addresstype: r.addresstype ?? "",
        country: r.address?.country ?? "",
        display_name: r.display_name ?? "",
        // Nominatim order [S, N, W, E] -> [W, S, E, N]
        bbox: [parseFloat(bb[2]), parseFloat(bb[0]), parseFloat(bb[3]), parseFloat(bb[1])],
        importance: r.importance ?? 0,
    };
}

/**
 * Geocode a free-text query via Nominatim. Returns the RAW response items.
 *
 * Applies the global 1 req/s throttle before each outbound request. Callers
 * must check the 24h Redis cache BEFORE calling this function so cached
 * responses bypass the throttle entirely.
 *
 * Returns an empty array immediately when the queue-depth cap is exceeded,
 * so callers should surface a "geocoder busy, try again" message to users.
 *
 * @throws on network failure / timeout (AbortSignal.timeout) or non-OK status.
 */
export async function fetchGeocode({ query, limit }: FetchGeocodeArgs): Promise<RawNominatimItem[]> {
    // Queue-depth cap: shed load immediately rather than stacking up waiters.
    if (_activeWaiters >= GLOBAL_THROTTLE_MAX_WAITERS) {
        return [];
    }

    _activeWaiters += 1;
    try {
        // Global 1 req/s OSM policy gate. Falls back to in-process gate on error.
        try {
            await waitForGlobalSlot();
        } catch {
            // redisSlidingWindow/Peek already handle their own errors internally.
            // This outer catch is a safety net for unexpected throws from the loop.
            await inProcessGate();
        }
    } finally {
        _activeWaiters -= 1;
    }

    const url = new URL(NOMINATIM_SEARCH_URL);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("namedetails", "1");

    const res = await fetch(url, {
        headers: {
            "User-Agent": USER_AGENT,
            "Accept-Language": "en",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
        throw new Error(`Nominatim returned HTTP ${res.status}`);
    }

    const raw = (await res.json()) as RawNominatimItem[];
    return Array.isArray(raw) ? raw : [];
}
