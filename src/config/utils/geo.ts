/**
 * Geo-Hilfen: Haversine-Distanz und Geocoding (Nominatim) für „In deiner Nähe“ (30 km).
 */

const FEATURED_RADIUS_KM = 30;
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

/**
 * Distanz in km zwischen zwei Punkten (Haversine).
 */
export function haversineDistanceKm(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
): number {
    const R = 6371; // Erdradius km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function toRad(deg: number): number {
    return (deg * Math.PI) / 180;
}

export function getFeaturedRadiusKm(): number {
    return FEATURED_RADIUS_KM;
}

export interface GeoCoords {
    lat: number;
    lng: number;
}

/**
 * Ort/PLZ zu Koordinaten (Nominatim). Rate-limited, nur bei Bedarf aufrufen.
 */
export async function geocodeLocation(location: string): Promise<GeoCoords | null> {
    const q = encodeURIComponent(location.trim());
    if (!q) return null;
    const url = `${NOMINATIM_URL}?q=${q}&format=json&limit=1&countrycodes=de`;
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': 'SimplySeat-Backend/1.0' }
        });
        if (!res.ok) return null;
        const data = await res.json() as { lat?: string; lon?: string }[];
        const first = data?.[0];
        if (!first?.lat || !first?.lon) return null;
        const lat = parseFloat(first.lat);
        const lng = parseFloat(first.lon);
        if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
        return { lat, lng };
    } catch {
        return null;
    }
}
