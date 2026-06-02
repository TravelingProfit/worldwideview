/**
 * localSources.test.ts
 *
 * Unit tests for the LocalDataSource registry module (Plan 30-02, Wave 2).
 * Covers: normalizer (GeoJSON -> GeoEntity), TTL cache, registry public API,
 * and barrel re-exports.
 *
 * Written RED first (Task 1): all tests fail until localSources/ is implemented.
 * Turns GREEN in Tasks 2 and 3.
 */
import {
    describe, it, expect, vi, beforeEach, afterEach,
} from "vitest";

// ---------------------------------------------------------------------------
// fs/promises mock — supplies fake plugin.json manifests + cameras GeoJSON
// Must be at module level (Vitest hoists vi.mock to top of file).
// ---------------------------------------------------------------------------

const FAKE_CAMERA_MANIFEST = JSON.stringify({
    id: "camera",
    name: "@worldwideview/wwv-plugin-camera",
    version: "1.0.12",
    type: "data-layer",
    format: "bundle",
    trust: "unverified",
    capabilities: ["layer"],
    category: "Infrastructure",
    icon: "Camera",
    entry: "/plugins-local/camera/frontend.mjs",
    localData: [
        { name: "default", type: "geojson", path: "/public-cameras.json" },
        { name: "traffic", type: "route", path: "/api/camera/traffic" },
    ],
});

// Moscow feature: GeoJSON is [lon, lat] — must become latitude=55.7, longitude=37.6
const MOSCOW_FEATURE = {
    type: "Feature",
    geometry: { type: "Point", coordinates: [37.6, 55.7] },
    properties: { country: "Russia", city: "Moscow", is_popular: true },
};

const FAKE_CAMERAS_GEOJSON = JSON.stringify({
    type: "FeatureCollection",
    features: [MOSCOW_FEATURE],
});

const FAKE_TRAFFIC_RESPONSE = JSON.stringify({
    type: "FeatureCollection",
    features: [
        {
            type: "Feature",
            geometry: { type: "Point", coordinates: [2.35, 48.85] },
            properties: { country: "France", city: "Paris", is_popular: false },
        },
    ],
});

global.fetch = vi.fn();

// Use clearAllMocks (clears call counts/results) not resetAllMocks (wipes implementations).
// resetAllMocks would strip the vi.fn() implementations, causing mocks to return undefined.
// Note: registry tests use _setReaderForTest injection instead of vi.mock("node:fs/promises")
// to avoid Vitest Node built-in mock interop limitations in the jsdom environment.
beforeEach(() => {
    vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Normalizer — normalizeGeoJson
// ---------------------------------------------------------------------------

describe("normalizer", () => {
    it("maps GeoJSON [lon, lat] coordinates to GeoEntity latitude=lat / longitude=lon (NOT swapped)", async () => {
        const { normalizeGeoJson } = await import("./localSources/normalizers");
        const fc = { type: "FeatureCollection", features: [MOSCOW_FEATURE] };
        const entities = normalizeGeoJson(fc, "default", "camera");
        expect(entities).toHaveLength(1);
        // coordinates [37.6, 55.7] = [lon, lat]; latitude must be 55.7
        expect(entities[0].latitude).toBeCloseTo(55.7, 4);
        expect(entities[0].longitude).toBeCloseTo(37.6, 4);
    });

    it("assigns id using camera-${prefix}-${index} pattern", async () => {
        const { normalizeGeoJson } = await import("./localSources/normalizers");
        const fc = { type: "FeatureCollection", features: [MOSCOW_FEATURE] };
        const entities = normalizeGeoJson(fc, "default", "camera");
        expect(entities[0].id).toBe("camera-default-0");
    });

    it("sets pluginId from the pluginId argument", async () => {
        const { normalizeGeoJson } = await import("./localSources/normalizers");
        const fc = { type: "FeatureCollection", features: [MOSCOW_FEATURE] };
        const entities = normalizeGeoJson(fc, "default", "camera");
        expect(entities[0].pluginId).toBe("camera");
    });

    it("sets altitude to 8 (cameraMapper parity)", async () => {
        const { normalizeGeoJson } = await import("./localSources/normalizers");
        const fc = { type: "FeatureCollection", features: [MOSCOW_FEATURE] };
        const entities = normalizeGeoJson(fc, "default", "camera");
        expect(entities[0].altitude).toBe(8);
    });

    it("preserves feature properties including country, city, is_popular", async () => {
        const { normalizeGeoJson } = await import("./localSources/normalizers");
        const fc = { type: "FeatureCollection", features: [MOSCOW_FEATURE] };
        const entities = normalizeGeoJson(fc, "default", "camera");
        expect(entities[0].properties.country).toBe("Russia");
        expect(entities[0].properties.city).toBe("Moscow");
        expect(entities[0].properties.is_popular).toBe(true);
    });

    it("sets label = city when city present", async () => {
        const { normalizeGeoJson } = await import("./localSources/normalizers");
        const fc = { type: "FeatureCollection", features: [MOSCOW_FEATURE] };
        const entities = normalizeGeoJson(fc, "default", "camera");
        expect(entities[0].label).toBe("Moscow");
    });

    it("falls back label to country when city is absent", async () => {
        const { normalizeGeoJson } = await import("./localSources/normalizers");
        const feature = {
            type: "Feature",
            geometry: { type: "Point", coordinates: [30.0, 50.0] },
            properties: { country: "Ukraine" },
        };
        const fc = { type: "FeatureCollection", features: [feature] };
        const entities = normalizeGeoJson(fc, "default", "camera");
        expect(entities[0].label).toBe("Ukraine");
    });

    it("falls back label to 'Unknown Camera' when both city and country absent", async () => {
        const { normalizeGeoJson } = await import("./localSources/normalizers");
        const feature = {
            type: "Feature",
            geometry: { type: "Point", coordinates: [0, 0] },
            properties: {},
        };
        const fc = { type: "FeatureCollection", features: [feature] };
        const entities = normalizeGeoJson(fc, "default", "camera");
        expect(entities[0].label).toBe("Unknown Camera");
    });

    it("handles empty FeatureCollection gracefully (returns [])", async () => {
        const { normalizeGeoJson } = await import("./localSources/normalizers");
        const fc = { type: "FeatureCollection", features: [] };
        const entities = normalizeGeoJson(fc, "default", "camera");
        expect(entities).toHaveLength(0);
    });

    it("handles unknown input shape gracefully (returns [])", async () => {
        const { normalizeGeoJson } = await import("./localSources/normalizers");
        const entities = normalizeGeoJson(null, "default", "camera");
        expect(entities).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// 2. TTL cache — getCached
// ---------------------------------------------------------------------------

describe("cache", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("invokes the fetcher on first call and returns its value", async () => {
        const { getCached } = await import("./localSources/cache");
        const fakeSnapshot = { pluginId: "camera", entities: [], timestamp: new Date() };
        const fetcher = vi.fn().mockResolvedValue(fakeSnapshot);
        const result = await getCached("cache-test-first", 60_000, fetcher);
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(result).toEqual(fakeSnapshot);
    });

    it("returns cached value on second call within TTL (fetcher called only once)", async () => {
        const { getCached } = await import("./localSources/cache");
        const fakeSnapshot = { pluginId: "camera", entities: [], timestamp: new Date() };
        const fetcher = vi.fn().mockResolvedValue(fakeSnapshot);
        await getCached("cache-test-ttl", 60_000, fetcher);
        // Advance time but stay within TTL
        vi.advanceTimersByTime(30_000);
        await getCached("cache-test-ttl", 60_000, fetcher);
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("refetches after TTL expires", async () => {
        const { getCached } = await import("./localSources/cache");
        const fakeSnapshot = { pluginId: "camera", entities: [], timestamp: new Date() };
        const fetcher = vi.fn().mockResolvedValue(fakeSnapshot);
        await getCached("cache-test-expire", 60_000, fetcher);
        // Advance past TTL
        vi.advanceTimersByTime(61_000);
        await getCached("cache-test-expire", 60_000, fetcher);
        expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it("exports TTL_GEOJSON_MS = 3600000 (60 min)", async () => {
        const { TTL_GEOJSON_MS } = await import("./localSources/cache");
        expect(TTL_GEOJSON_MS).toBe(60 * 60 * 1000);
    });

    it("exports TTL_ROUTE_MS = 60000 (60 s)", async () => {
        const { TTL_ROUTE_MS } = await import("./localSources/cache");
        expect(TTL_ROUTE_MS).toBe(60 * 1000);
    });
});

// ---------------------------------------------------------------------------
// 3. Registry — hasLocalSource, getLocalSourceIds, resolveLocalSnapshot
// ---------------------------------------------------------------------------

describe("registry", () => {
    // Fake fs reader using the module-level constants — injected via _setReaderForTest
    // to bypass Vitest's Node built-in mock interop limitations (jsdom environment).
    const fakeReaddir = async (dir: string): Promise<string[]> => {
        if (String(dir).includes("plugins-local")) return ["camera"];
        return [];
    };
    const fakeReadfile = async (filePath: string, _encoding: string): Promise<string> => {
        const p = String(filePath);
        if (p.includes("plugins-local") && p.includes("camera") && p.includes("plugin.json")) {
            return FAKE_CAMERA_MANIFEST;
        }
        if (p.includes("public-cameras.json")) {
            return FAKE_CAMERAS_GEOJSON;
        }
        throw Object.assign(new Error("ENOENT: no such file or directory"), { code: "ENOENT" });
    };

    beforeEach(async () => {
        const { _resetRegistry, _setReaderForTest } = await import("./localSources/registry");
        // Inject fake fs reader so registry reads mock manifests, not real disk.
        _setReaderForTest(fakeReaddir, fakeReadfile);
        // Reset the memoized registry so each test gets a fresh scan with the injected reader.
        _resetRegistry();
        // Clear the per-source data cache so each test reads through the fake reader.
        const { _clearCache } = await import("./localSources/cache");
        _clearCache();
        // Re-supply fetch mock for route source
        vi.mocked(global.fetch).mockResolvedValue(
            new Response(FAKE_TRAFFIC_RESPONSE, { status: 200 }),
        );
    });

    afterEach(async () => {
        const { _restoreReader } = await import("./localSources/registry");
        _restoreReader();
    });

    it("hasLocalSource('camera') returns true after building from manifests", async () => {
        const { hasLocalSource } = await import("./localSources/registry");
        expect(await hasLocalSource("camera")).toBe(true);
    });

    it("hasLocalSource('nope') returns false for unknown plugin", async () => {
        const { hasLocalSource } = await import("./localSources/registry");
        expect(await hasLocalSource("nope")).toBe(false);
    });

    it("getLocalSourceIds() returns a Set that includes 'camera'", async () => {
        const { getLocalSourceIds } = await import("./localSources/registry");
        const ids = await getLocalSourceIds();
        expect(ids).toBeInstanceOf(Set);
        expect(ids.has("camera")).toBe(true);
    });

    it("resolveLocalSnapshot('camera') returns a PluginDataSnapshot", async () => {
        const { resolveLocalSnapshot } = await import("./localSources/registry");
        const snapshot = await resolveLocalSnapshot("camera");
        expect(snapshot.pluginId).toBe("camera");
        expect(Array.isArray(snapshot.entities)).toBe(true);
        expect(snapshot.timestamp).toBeInstanceOf(Date);
    });

    it("resolveLocalSnapshot('camera') entities have non-zero length (geojson source loaded)", async () => {
        const { resolveLocalSnapshot } = await import("./localSources/registry");
        const snapshot = await resolveLocalSnapshot("camera");
        // At minimum the geojson source (Moscow) should produce 1 entity
        expect(snapshot.entities.length).toBeGreaterThan(0);
    });

    it("resolveLocalSnapshot geojson entities preserve correct lat/lon order (Russia: lat~55, lon~37)", async () => {
        const { resolveLocalSnapshot } = await import("./localSources/registry");
        const snapshot = await resolveLocalSnapshot("camera");
        const russiaEntity = snapshot.entities.find(
            (e) => e.properties.country === "Russia",
        );
        expect(russiaEntity).toBeDefined();
        // Moscow coords in GeoJSON: [37.6x, 55.7x] = [lon, lat].
        // latitude (55) > longitude (37) confirms coordinates are NOT swapped.
        expect(russiaEntity!.latitude).toBeGreaterThan(50);
        expect(russiaEntity!.latitude).toBeLessThan(60);
        expect(russiaEntity!.longitude).toBeGreaterThan(30);
        expect(russiaEntity!.longitude).toBeLessThan(45);
        // Swap guard: latitude must be the larger value for Moscow
        expect(russiaEntity!.latitude).toBeGreaterThan(russiaEntity!.longitude);
    });

    it("resolveLocalSnapshot throws for unknown plugin id", async () => {
        const { resolveLocalSnapshot } = await import("./localSources/registry");
        await expect(resolveLocalSnapshot("unknown-plugin")).rejects.toThrow();
    });

    it("fetchRouteSource rejects an absolute-URL path (SSRF guard)", async () => {
        // Inject a reader that returns a manifest with an absolute-URL route source.
        const maliciousManifest = JSON.stringify({
            id: "camera",
            name: "@worldwideview/wwv-plugin-camera",
            version: "1.0.0",
            type: "data-layer",
            format: "bundle",
            trust: "unverified",
            capabilities: ["layer"],
            category: "Infrastructure",
            icon: "Camera",
            entry: "/plugins-local/camera/frontend.mjs",
            localData: [
                { name: "evil", type: "route", path: "http://attacker.example/steal" },
            ],
        });

        const { _resetRegistry, _setReaderForTest } = await import("./localSources/registry");
        _setReaderForTest(
            async (dir) => (String(dir).includes("plugins-local") ? ["camera"] : []),
            async (filePath) => {
                if (String(filePath).includes("plugin.json")) return maliciousManifest;
                throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
            },
        );
        _resetRegistry();

        const { resolveLocalSnapshot } = await import("./localSources/registry");
        await expect(resolveLocalSnapshot("camera")).rejects.toThrow(/non-relative/);
    });

    it("type allowlist drops non-geojson/route sources (only allowed types enter registry)", async () => {
        // Manifest declares an unsupported type "csv" — registry should drop it,
        // leaving the plugin with 0 valid sources and therefore not registering it.
        const badTypeManifest = JSON.stringify({
            id: "camera",
            name: "@worldwideview/wwv-plugin-camera",
            version: "1.0.0",
            type: "data-layer",
            format: "bundle",
            trust: "unverified",
            capabilities: ["layer"],
            category: "Infrastructure",
            icon: "Camera",
            entry: "/plugins-local/camera/frontend.mjs",
            localData: [
                { name: "feed", type: "csv", path: "/cameras.csv" },
            ],
        });

        const { _resetRegistry, _setReaderForTest } = await import("./localSources/registry");
        _setReaderForTest(
            async (dir) => (String(dir).includes("plugins-local") ? ["camera"] : []),
            async (filePath) => {
                if (String(filePath).includes("plugin.json")) return badTypeManifest;
                throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
            },
        );
        _resetRegistry();

        const { hasLocalSource } = await import("./localSources/registry");
        // "camera" should NOT be registered because its only source has a forbidden type.
        expect(await hasLocalSource("camera")).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// 4. Barrel re-export — index.ts
// ---------------------------------------------------------------------------

describe("localSources barrel (index.ts)", () => {
    it("exports hasLocalSource", async () => {
        const mod = await import("./localSources/index");
        expect(typeof mod.hasLocalSource).toBe("function");
    });

    it("exports getLocalSourceIds", async () => {
        const mod = await import("./localSources/index");
        expect(typeof mod.getLocalSourceIds).toBe("function");
    });

    it("exports resolveLocalSnapshot", async () => {
        const mod = await import("./localSources/index");
        expect(typeof mod.resolveLocalSnapshot).toBe("function");
    });
});
