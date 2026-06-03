import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

// ---------------------------------------------------------------------------
// Module mocks -- declared before any imports of the SUT so Vitest hoists them.
// ---------------------------------------------------------------------------

vi.mock("@/lib/healthProbes", () => ({
    probeRedis: vi.fn(),
    probeDb: vi.fn(),
    probeEngine: vi.fn(),
    probeConfig: vi.fn(),
}));

vi.mock("@/core/edition", () => ({
    edition: "local",
}));

import {
    probeRedis,
    probeDb,
    probeEngine,
    probeConfig,
} from "@/lib/healthProbes";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setProbes(opts: {
    redis?: boolean;
    db?: boolean;
    engine?: boolean;
    config?: boolean;
}): void {
    vi.mocked(probeRedis).mockResolvedValue(opts.redis ?? true);
    vi.mocked(probeDb).mockResolvedValue(opts.db ?? true);
    vi.mocked(probeEngine).mockResolvedValue(opts.engine ?? true);
    // probeConfig is synchronous in the real impl; mock as a plain return value.
    vi.mocked(probeConfig).mockReturnValue(opts.config ?? true);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/health", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it("returns 200 healthy when all probes pass (OBS-01 happy path)", async () => {
        setProbes({ redis: true, db: true, engine: true, config: true });

        const res = await GET();
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.status).toBe("healthy");
        expect(body.checks).toEqual({ redis: true, db: true, engine: true, config: true });
        expect(body).toHaveProperty("edition");
        expect(body).toHaveProperty("timestamp");
    });

    it("returns 200 degraded with checks.redis=false when redis probe fails (OBS-01 redis-down)", async () => {
        setProbes({ redis: false, db: true, engine: true, config: true });

        const res = await GET();
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.status).toBe("degraded");
        expect(body.checks.redis).toBe(false);
        expect(body.checks.db).toBe(true);
    });

    it("returns 503 unhealthy when db probe fails (OBS-01 db-down)", async () => {
        setProbes({ redis: true, db: false, engine: true, config: true });

        const res = await GET();
        const body = await res.json();

        expect(res.status).toBe(503);
        expect(body.status).toBe("unhealthy");
        expect(body.checks.db).toBe(false);
    });

    it("returns 200 degraded when engine probe fails (OBS-01 engine-down)", async () => {
        setProbes({ redis: true, db: true, engine: false, config: true });

        const res = await GET();
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.status).toBe("degraded");
        expect(body.checks.engine).toBe(false);
    });

    it("returns 503 unhealthy when config probe fails in cloud edition (OBS-01 config-misconfigured)", async () => {
        // Simulate cloud edition with getSigningKey() having thrown (probeConfig returns false).
        vi.mocked(probeConfig).mockReturnValue(false);
        vi.mocked(probeRedis).mockResolvedValue(true);
        vi.mocked(probeDb).mockResolvedValue(true);
        vi.mocked(probeEngine).mockResolvedValue(true);

        const res = await GET();
        const body = await res.json();

        expect(res.status).toBe(503);
        expect(body.status).toBe("unhealthy");
        expect(body.checks.config).toBe(false);
    });

    it("includes edition and ISO timestamp in every response (OBS-01 shape)", async () => {
        setProbes({});

        const res = await GET();
        const body = await res.json();

        expect(typeof body.edition).toBe("string");
        expect(typeof body.timestamp).toBe("string");
        // ISO 8601 basic check
        expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
});
