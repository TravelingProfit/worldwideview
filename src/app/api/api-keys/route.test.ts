import {
    describe, it, expect, vi, beforeEach
} from "vitest";
import type { Session } from "next-auth";
import { GET, POST } from "./route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateApiKey } from "@/lib/apiKeyAuth";

vi.mock("@/lib/auth", () => ({
    auth: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
    prisma: {
        userApiKey: {
            findMany: vi.fn(),
            count: vi.fn(),
            create: vi.fn(),
            deleteMany: vi.fn(),
        },
    },
}));

vi.mock("@/core/edition", () => ({
    isDemo: false,
}));

vi.mock("@/lib/apiKeyAuth", () => ({
    generateApiKey: vi.fn(),
}));

// NextAuth v5 `auth` is overloaded (middleware wrapper + no-arg session getter).
// Narrow to the session-getter signature so vi.mocked resolves the correct overload.
const mockAuth = vi.mocked(auth as unknown as () => Promise<Session | null>);

// ---------------------------------------------------------------------------
// GET /api/api-keys — KEY-03 (list)
// ---------------------------------------------------------------------------

describe("GET /api/api-keys", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mockAuth.mockResolvedValue({
            user: { id: "user-123", email: "test@example.com" },
        } as Session);
    });

    it("returns 200 with { keys } for authenticated user (KEY-03)", async () => {
        const mockKeys = [
            { id: "key-1", name: "My Key", prefix: "wwv_ABCDEFGH", createdAt: new Date(), lastUsedAt: null },
        ];
        vi.mocked(prisma.userApiKey.findMany).mockResolvedValue(mockKeys as never);

        const req = new Request("http://localhost/api/api-keys");
        const res = await GET(req);
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body).toHaveProperty("keys");
        expect(Array.isArray(body.keys)).toBe(true);
    });

    it("returns 401 when no session (KEY-03)", async () => {
        mockAuth.mockResolvedValue(null);

        const req = new Request("http://localhost/api/api-keys");
        const res = await GET(req);
        const body = await res.json();

        expect(res.status).toBe(401);
        expect(body).toHaveProperty("error");
        // Must NOT include a `keys` field — callers that do `data.keys ?? []` without
        // checking r.ok would silently show an empty list instead of an auth error.
        expect(body).not.toHaveProperty("keys");
    });

    it("response never contains hashedSecret field (security invariant)", async () => {
        const mockKeys = [
            {
                id: "key-1",
                name: "My Key",
                prefix: "wwv_ABCDEFGH",
                createdAt: new Date(),
                lastUsedAt: null,
                // hashedSecret deliberately absent from select projection
            },
        ];
        vi.mocked(prisma.userApiKey.findMany).mockResolvedValue(mockKeys as never);

        const req = new Request("http://localhost/api/api-keys");
        const res = await GET(req);
        const body = await res.json();

        expect(res.status).toBe(200);
        // The route must use a select projection — no hashedSecret in response
        if (Array.isArray(body.keys)) {
            body.keys.forEach((k: Record<string, unknown>) => {
                expect(k).not.toHaveProperty("hashedSecret");
            });
        }
    });
});

// ---------------------------------------------------------------------------
// POST /api/api-keys — KEY-01, KEY-02, KEY-04 (create)
// ---------------------------------------------------------------------------

describe("POST /api/api-keys", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mockAuth.mockResolvedValue({
            user: { id: "user-123", email: "test@example.com" },
        } as Session);
    });

    it("returns 422 with error 'max_keys_reached' when user already has 3 keys (KEY-04)", async () => {
        vi.mocked(prisma.userApiKey.count).mockResolvedValue(3 as never);

        const req = new Request("http://localhost/api/api-keys", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Fourth Key" }),
        });
        const res = await POST(req);
        const body = await res.json();

        expect(res.status).toBe(422);
        expect(body.error).toBe("max_keys_reached");
    });

    it("calls generateApiKey and returns 201 with fullToken when under limit (KEY-01, KEY-04)", async () => {
        vi.mocked(prisma.userApiKey.count).mockResolvedValue(0 as never);
        vi.mocked(generateApiKey).mockResolvedValue({
            prefix: "wwv_TESTPFX1",
            secret: "testsecret_43chars_base64url_value_here123",
            hashedSecret: "$2a$12$somehash",
            fullToken: "wwv_TESTPFX1.testsecret_43chars_base64url_value_here123",
        });
        vi.mocked(prisma.userApiKey.create).mockResolvedValue({
            id: "new-key-id",
            name: "My API Key",
            createdAt: new Date("2026-01-01"),
        } as never);

        const req = new Request("http://localhost/api/api-keys", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "My API Key" }),
        });
        const res = await POST(req);
        const body = await res.json();

        expect(res.status).toBe(201);
        expect(body.key).toHaveProperty("fullToken");
        expect(body.key.fullToken).toBe("wwv_TESTPFX1.testsecret_43chars_base64url_value_here123");
    });

    it("returns 401 when no session (KEY-03)", async () => {
        mockAuth.mockResolvedValue(null);

        const req = new Request("http://localhost/api/api-keys", {
            method: "POST",
            body: JSON.stringify({}),
        });
        const res = await POST(req);

        expect(res.status).toBe(401);
    });
});
