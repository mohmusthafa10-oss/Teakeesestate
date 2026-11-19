import { Property, PropertyStatus } from '../types/crm';

export interface LatLng {
  lat: number;
  lng: number;
}

export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

export function getPropertyCoords(
  prop: Pick<Property, 'latitude' | 'longitude' | 'coordinates'>
): LatLng | null {
  if (isValidLatLng(prop.latitude, prop.longitude)) {
    return { lat: prop.latitude as number, lng: prop.longitude as number };
  }
  if (prop.coordinates && isValidLatLng(prop.coordinates.lat, prop.coordinates.lng)) {
    return { lat: prop.coordinates.lat, lng: prop.coordinates.lng };
  }
  return null;
}

export function hasValidCoordinates(
  prop: Pick<Property, 'latitude' | 'longitude' | 'coordinates'>
): boolean {
  return getPropertyCoords(prop) !== null;
}

export function getStatusPinStyle(status: PropertyStatus): {
  fill: string;
  stroke: string;
  label: string;
  dotClass: string;
} {
  switch (status) {
    case 'Available':
      return {
        fill: '#15803D',
        stroke: '#FFFFFF',
        label: 'Available',
        dotClass: 'bg-[#15803D]',
      };
    case 'Under Negotiation':
      return {
        fill: '#EA580C',
        stroke: '#FFFFFF',
        label: 'Under Negotiation',
        dotClass: 'bg-[#EA580C]',
      };
    case 'Reserved':
      return {
        fill: '#CA8A04',
        stroke: '#FFFFFF',
        label: 'Reserved',
        dotClass: 'bg-[#CA8A04]',
      };
    case 'Sold':
      return {
        fill: '#6B7280',
        stroke: '#FFFFFF',
        label: 'Sold',
        dotClass: 'bg-[#6B7280]',
      };
    case 'Rented':
      return {
        fill: '#2563EB',
        stroke: '#FFFFFF',
        label: 'Rented / Occupied',
        dotClass: 'bg-[#2563EB]',
      };
    case 'Inactive':
    default:
      return {
        fill: '#9CA3AF',
        stroke: '#FFFFFF',
        label: 'Inactive',
        dotClass: 'bg-[#9CA3AF]',
      };
  }
}

export interface GeocodingResult {
  placeId: string;
  displayName: string;
  lat: number;
  lng: number;
  district?: string;
  locality?: string;
}

export async function searchLocationNominatim(
  query: string
): Promise<GeocodingResult[]> {
  const clean = query.trim();
  if (!clean) return [];
  const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6&q=${encodeURIComponent(
    clean
  )}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error('Location search service is temporarily unavailable.');
  }
  const data = (await res.json()) as Array<{
    place_id: number;
    display_name: string;
    lat: string;
    lon: string;
    address?: {
      city?: string;
      town?: string;
      village?: string;
      suburb?: string;
      county?: string;
      state_district?: string;
    };
  }>;

  return data
    .map((item) => ({
      placeId: String(item.place_id),
      displayName: item.display_name,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      district: item.address?.state_district || item.address?.county,
      locality:
        item.address?.suburb ||
        item.address?.village ||
        item.address?.town ||
        item.address?.city,
    }))
    .filter((r) => isValidLatLng(r.lat, r.lng));
}
