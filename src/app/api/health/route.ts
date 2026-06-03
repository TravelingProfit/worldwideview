import { NextResponse } from "next/server";
import { edition } from "@/core/edition";
import { probeRedis, probeDb, probeEngine, probeConfig } from "@/lib/healthProbes";

// ---------------------------------------------------------------------------
// Status + HTTP code policy:
//   db down OR config misconfigured (cloud/demo) -> "unhealthy", 503
//     Rationale: the app is either unable to authenticate requests or
//     fundamentally broken. A load balancer or container orchestrator should
//     stop routing traffic and alert the operator.
//   redis down OR engine down (but db + config ok) -> "degraded", 200
//     Rationale: auth/session reads still work; only streaming data or
//     rate-limiting is impaired. 200 avoids container restarts for transient
//     upstream outages.
//   all ok -> "healthy", 200
// ---------------------------------------------------------------------------

type HealthStatus = "healthy" | "degraded" | "unhealthy";

interface HealthBody {
    status: HealthStatus;
    checks: {
        redis: boolean;
        db: boolean;
        engine: boolean;
        config: boolean;
    };
    edition: string;
    timestamp: string;
}

export async function GET(): Promise<NextResponse<HealthBody>> {
    // Run all probes in parallel. probeConfig is sync but wrapped in
    // Promise.resolve so all four settle together with Promise.all.
    const [redis, db, engine, config] = await Promise.all([
        probeRedis(),
        probeDb(),
        probeEngine(),
        Promise.resolve(probeConfig()),
    ]);

    const checks = { redis, db, engine, config };

    let status: HealthStatus;
    let httpStatus: 200 | 503;

    if (!db || !config) {
        status = "unhealthy";
        httpStatus = 503;
    } else if (!redis || !engine) {
        status = "degraded";
        httpStatus = 200;
    } else {
        status = "healthy";
        httpStatus = 200;
    }

    const body: HealthBody = {
        status,
        checks,
        edition,
        timestamp: new Date().toISOString(),
    };

    return NextResponse.json(body, { status: httpStatus });
}
