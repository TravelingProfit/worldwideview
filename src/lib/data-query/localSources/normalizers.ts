/**
 * @file normalizers.ts
 * @description Server-side GeoJSON FeatureCollection -> GeoEntity[] transform.
 *
 * Reimplements the ~15-line mapGeoJsonFeature logic from
 * local-plugins/wwv-plugin-camera/src/cameraMapper.ts WITHOUT importing that
 * barrel (it pulls React/lucide-react and camera is not in transpilePackages).
 *
 * Coordinate order: GeoJSON spec is [longitude, latitude] — we destructure
 * `const [lon, lat] = coordinates` and assign `latitude: lat, longitude: lon`.
 * Getting this backwards is the primary footgun (see plan Pitfall 1).
 */

import type { GeoEntity } from "@worldwideview/wwv-plugin-sdk";

const DEFAULT_CAMERA_ALT = 8;

/**
 * Narrows an unknown GeoJSON feature to a typed shape for safe destructuring.
 */
interface GeoJsonFeature {
    geometry?: { coordinates?: number[] };
    properties?: Record<string, unknown>;
}

/**
 * Narrows an unknown GeoJSON FeatureCollection to a typed shape.
 */
interface GeoJsonFeatureCollection {
    features?: unknown[];
}

/**
 * normalizeGeoJson
 *
 * Converts a GeoJSON FeatureCollection (parsed from disk or fetched as JSON)
 * into a GeoEntity[]. Returns [] for malformed or empty input — never throws.
 *
 * @param input      - Unknown value expected to be a FeatureCollection object.
 * @param prefix     - Source name used in entity id (e.g. "default", "traffic").
 * @param pluginId   - Plugin identifier assigned to every entity.
 */
export function normalizeGeoJson(
    input: unknown,
    prefix: string,
    pluginId: string,
): GeoEntity[] {
    if (typeof input !== "object" || input === null) return [];

    const collection = input as GeoJsonFeatureCollection;
    if (!Array.isArray(collection.features)) return [];

    const entities: GeoEntity[] = [];

    for (let index = 0; index < collection.features.length; index++) {
        const feature = collection.features[index] as GeoJsonFeature;
        if (typeof feature !== "object" || feature === null) continue;

        // GeoJSON coordinate order is [longitude, latitude] — destructure accordingly.
        // Swapping these is Pitfall 1 (plan constraint).
        const [lon = 0, lat = 0] = feature.geometry?.coordinates ?? [];
        const props: Record<string, unknown> = feature.properties ?? {};

        const label =
            (props.city as string | undefined) ||
            (props.country as string | undefined) ||
            "Unknown Camera";

        entities.push({
            id: `${pluginId}-${prefix}-${index}`,
            pluginId,
            latitude: lat,
            longitude: lon,
            altitude: DEFAULT_CAMERA_ALT,
            timestamp: new Date(),
            label,
            properties: { ...props },
        });
    }

    return entities;
}
