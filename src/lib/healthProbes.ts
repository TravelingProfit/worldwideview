/**
 * Health probe helpers for GET /api/health.
 *
 * Each probe catches its own errors and resolves to a boolean.
 * A probe must never throw out to the caller.
 * All probes use short timeouts so a hung dependency cannot stall the response.
 */

import { redis } from "@/lib/redis";
import { prisma } from "@/lib/db";
import { getEngineUrl } from "@/lib/data-query/service";
import { isSigningKeyValid } from "@/lib/signingKeyConfig";

// Shared probe timeout in milliseconds.
const PROBE_TIMEOUT_MS = 2000;

// ---------------------------------------------------------------------------
// Timeout utility
// ---------------------------------------------------------------------------

/**
 * Races a promise against a timer. The timer handle is always cleared in
 * a finally block so no setTimeout handle dangles after the race resolves.
 *
 * Returns the fallback value when the timer fires first.
 */
function withTimeout<T>(op: Promise<T>, fallback: T, ms: number): Promise<T> {
    let handle: ReturnType<typeof setTimeout>;
    const timer = new Promise<T>((resolve) => {
        handle = setTimeout(() => resolve(fallback), ms);
    });
    return Promise.race([op, timer]).finally(() => clearTimeout(handle));
}

// ---------------------------------------------------------------------------
// Redis
// ---------------------------------------------------------------------------

/** Returns true when ioredis can execute PING within the timeout. */
export async function probeRedis(): Promise<boolean> {
    try {
        const result = await withTimeout(redis.ping(), "TIMEOUT", PROBE_TIMEOUT_MS);
        return result === "PONG";
    } catch {
        return false;
    }
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

/** Returns true when Prisma can execute SELECT 1 within the timeout. */
export async function probeDb(): Promise<boolean> {
    try {
        // db.ts wraps PrismaClient in an `as unknown as PrismaClient` cast, so
        // $queryRaw is present at runtime but absent from the inferred type.
        const query = (prisma as unknown as { $queryRaw: (tpl: TemplateStringsArray) => Promise<unknown> })
            .$queryRaw`SELECT 1`
            .then(() => true)
            .catch(() => false);
        return await withTimeout(query, false, PROBE_TIMEOUT_MS);
    } catch {
        return false;
    }
}

// ---------------------------------------------------------------------------
// Data engine
// ---------------------------------------------------------------------------

/**
 * Returns true when the data engine manifest endpoint responds with 2xx.
 * Uses getEngineUrl() from the data-query service so both resolve the same URL.
 */
export async function probeEngine(): Promise<boolean> {
    const engineUrl = getEngineUrl() + "/manifest";
    try {
        const res = await fetch(engineUrl, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
        return res.ok;
    } catch {
        return false;
    }
}

// ---------------------------------------------------------------------------
// Config / HMAC signing key
// ---------------------------------------------------------------------------

/**
 * Returns true when the HMAC signing-key preconditions are satisfied.
 * Delegates to isSigningKeyValid() -- single source of truth for the rule.
 */
export function probeConfig(): boolean {
    return isSigningKeyValid();
}
