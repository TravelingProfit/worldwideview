/**
 * Per-user sliding-window rate limiter for geocoding (Phase 22 Wave 2, 22-02).
 *
 * Implements a Redis ZSET sliding window keyed per user. Each call prunes
 * entries older than WINDOW_MS, records the current request, bounds the key
 * lifetime, then counts. If the count exceeds MAX_REQUESTS the call is rejected.
 *
 * Best-effort (T-22-02-05): on any Redis error we fail OPEN (return undefined)
 * so a broken rate-limit check never causes a permanent geocoding outage. The
 * 1 req/sec limit is advisory rather than a hard security boundary.
 */

import { redis } from "@/lib/redis";

const WINDOW_MS = 1_000;
const MAX_REQUESTS = 1;
const KEY_TTL_SECONDS = 5;
const RETRY_AFTER_MS = 1_000;

export interface RateLimitExceeded {
    error: "rate_limited";
    retryAfterMs: number;
}

function rateKey(userId: string): string {
    return `nominatim:ratelimit:${userId}`;
}

/** Returns a unique ZSET member string for the current timestamp. */
function uniqueMember(now: number): string {
    return `${now}:${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Returns `undefined` when the request is allowed, or a `rate_limited` result
 * object when the per-user window limit is exceeded.
 */
export async function checkRateLimit(userId: string): Promise<RateLimitExceeded | undefined> {
    const key = rateKey(userId);
    try {
        const now = Date.now();
        await redis.zremrangebyscore(key, "-inf", now - WINDOW_MS);
        await redis.zadd(key, now, uniqueMember(now));
        await redis.expire(key, KEY_TTL_SECONDS);
        const count = await redis.zcard(key);
        if (count > MAX_REQUESTS) {
            return { error: "rate_limited", retryAfterMs: RETRY_AFTER_MS };
        }
        return undefined;
    } catch (err) {
        console.warn("[geocodingRateLimit] Redis error, failing open:", err);
        return undefined;
    }
}

// ---------------------------------------------------------------------------
// Generic ZSET sliding-window helper (SEC-02)
//
// Reusable across any endpoint that needs per-identity Redis-backed limiting.
// Fails OPEN on Redis errors. A broken rate limiter should never block legit
// traffic. It is advisory rather than a hard security boundary.
// ---------------------------------------------------------------------------

export interface SlidingWindowResult {
    /** true when the request is within the allowed window */
    allowed: boolean;
    /** milliseconds until the oldest request ages out; meaningful only when !allowed */
    retryAfterMs: number;
}

/**
 * ZSET sliding-window check.
 *
 * Uses unique members (timestamp + random suffix) so same-millisecond calls
 * each occupy their own slot rather than collapsing into one (undercount fix).
 *
 * retryAfterMs is computed from the oldest in-window entry's score rather than
 * the full windowMs, giving callers an accurate wait time.
 *
 * @param key      Redis key (must be unique per identity + endpoint)
 * @param limit    Maximum requests allowed inside the window
 * @param windowMs Window duration in milliseconds
 */
export async function redisSlidingWindow(
    key: string,
    limit: number,
    windowMs: number,
): Promise<SlidingWindowResult> {
    try {
        const now = Date.now();
        const windowStart = now - windowMs;
        const ttlSeconds = Math.ceil(windowMs / 1_000) + 1;

        await redis.zremrangebyscore(key, "-inf", windowStart);
        await redis.zadd(key, now, uniqueMember(now));
        await redis.expire(key, ttlSeconds);
        const count = await redis.zcard(key);

        if (count > limit) {
            // Compute time until the oldest in-window member ages out.
            const oldest = await redis.zrange(key, 0, 0, "WITHSCORES");
            const oldestScore = oldest.length >= 2 ? Number(oldest[1]) : now;
            const retryAfterMs = Math.max(1, oldestScore + windowMs - now);
            return { allowed: false, retryAfterMs };
        }
        return { allowed: true, retryAfterMs: 0 };
    } catch (err) {
        console.warn("[redisSlidingWindow] Redis error, failing open:", err);
        return { allowed: true, retryAfterMs: 0 };
    }
}

// ---------------------------------------------------------------------------
// DEPLOY-03: peek helper for the global Nominatim throttle poll loop.
//
// Counts how many requests are currently in the window WITHOUT adding a new
// entry. Used by waitForGlobalSlot to poll for slot availability without
// inflating the ZSET on every iteration of the wait loop. The committing
// add happens only once, via redisSlidingWindow, when the slot is taken.
// ---------------------------------------------------------------------------

export interface SlidingWindowPeekResult {
    /** Number of entries currently inside the window. */
    count: number;
    /** Milliseconds until the oldest in-window entry ages out (0 when count is 0). */
    retryAfterMs: number;
}

/**
 * Read-only ZSET sliding-window count.
 *
 * Prunes expired entries then counts, but does NOT add a new member.
 * Fails OPEN (count: 0) on Redis errors so a Redis outage never stalls the
 * wait loop indefinitely.
 *
 * @param key      Redis key (same key passed to redisSlidingWindow)
 * @param windowMs Window duration in milliseconds
 */
export async function redisSlidingWindowPeek(
    key: string,
    windowMs: number,
): Promise<SlidingWindowPeekResult> {
    try {
        const now = Date.now();
        const windowStart = now - windowMs;
        const ttlSeconds = Math.ceil(windowMs / 1_000) + 1;

        await redis.zremrangebyscore(key, "-inf", windowStart);
        await redis.expire(key, ttlSeconds);
        const count = await redis.zcard(key);

        if (count === 0) {
            return { count: 0, retryAfterMs: 0 };
        }

        const oldest = await redis.zrange(key, 0, 0, "WITHSCORES");
        const oldestScore = oldest.length >= 2 ? Number(oldest[1]) : now;
        const retryAfterMs = Math.max(1, oldestScore + windowMs - now);
        return { count, retryAfterMs };
    } catch (err) {
        console.warn("[redisSlidingWindowPeek] Redis error, failing open:", err);
        return { count: 0, retryAfterMs: 0 };
    }
}
