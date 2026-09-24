import { getPhoneLocation } from '@/lib/phoneLocation';

export type OwnedDialerNumber = {
  e164: string;
  areaCode: string;
  state: string;
  lat?: number;
  lng?: number;
};

/** Geographic centroids for all 50 states + DC, keyed by state code. */
const STATE_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  AL: { lat: 32.806671, lng: -86.791130 },
  AK: { lat: 61.370716, lng: -152.404419 },
  AZ: { lat: 33.729759, lng: -111.431221 },
  AR: { lat: 34.969704, lng: -92.373123 },
  CA: { lat: 36.116203, lng: -119.681564 },
  CO: { lat: 39.059811, lng: -105.311104 },
  CT: { lat: 41.597782, lng: -72.755371 },
  DE: { lat: 39.318523, lng: -75.507141 },
  DC: { lat: 38.897438, lng: -77.026817 },
  FL: { lat: 27.766279, lng: -81.686783 },
  GA: { lat: 33.040619, lng: -83.643074 },
  HI: { lat: 21.094318, lng: -157.498337 },
  ID: { lat: 44.240459, lng: -114.478828 },
  IL: { lat: 40.349457, lng: -88.986137 },
  IN: { lat: 39.849426, lng: -86.258278 },
  IA: { lat: 42.011539, lng: -93.210526 },
  KS: { lat: 38.526600, lng: -96.726486 },
  KY: { lat: 37.668140, lng: -84.670067 },
  LA: { lat: 31.169546, lng: -91.867805 },
  ME: { lat: 44.693947, lng: -69.381927 },
  MD: { lat: 39.063946, lng: -76.802101 },
  MA: { lat: 42.230171, lng: -71.530106 },
  MI: { lat: 43.326618, lng: -84.536095 },
  MN: { lat: 45.694454, lng: -93.900192 },
  MS: { lat: 32.741646, lng: -89.678696 },
  MO: { lat: 38.456085, lng: -92.288368 },
  MT: { lat: 46.921925, lng: -110.454353 },
  NE: { lat: 41.125370, lng: -98.268082 },
  NV: { lat: 38.313515, lng: -117.055374 },
  NH: { lat: 43.452492, lng: -71.563896 },
  NJ: { lat: 40.298904, lng: -74.521011 },
  NM: { lat: 34.840515, lng: -106.248482 },
  NY: { lat: 42.165726, lng: -74.948051 },
  NC: { lat: 35.630066, lng: -79.806419 },
  ND: { lat: 47.528912, lng: -99.784012 },
  OH: { lat: 40.388783, lng: -82.764915 },
  OK: { lat: 35.565342, lng: -96.928917 },
  OR: { lat: 44.572021, lng: -122.070938 },
  PA: { lat: 40.590752, lng: -77.209755 },
  RI: { lat: 41.680893, lng: -71.511780 },
  SC: { lat: 33.856892, lng: -80.945007 },
  SD: { lat: 44.299782, lng: -99.438828 },
  TN: { lat: 35.747845, lng: -86.692345 },
  TX: { lat: 31.054487, lng: -97.563461 },
  UT: { lat: 40.150032, lng: -111.862434 },
  VT: { lat: 44.045876, lng: -72.710686 },
  VA: { lat: 37.769337, lng: -78.169968 },
  WA: { lat: 47.400902, lng: -121.490494 },
  WV: { lat: 38.491226, lng: -80.954453 },
  WI: { lat: 44.268543, lng: -89.616508 },
  WY: { lat: 42.755966, lng: -107.302490 },
};

const DEFAULT_OWNED: OwnedDialerNumber[] = [
  { e164: '+16318922787', areaCode: '631', state: 'NY', lat: 40.73, lng: -73.21 },
  { e164: '+19094793674', areaCode: '909', state: 'CA', lat: 34.01, lng: -117.69 },
  { e164: '+18328477728', areaCode: '832', state: 'TX', lat: 29.58, lng: -95.76 },
];

function toE164Us(raw: string): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (/^\+[1-9]\d{6,14}$/.test(raw.trim())) return raw.trim();
  return null;
}

function usAreaCode(e164: string): string | null {
  const digits = e164.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1, 4);
  if (digits.length === 10) return digits.slice(0, 3);
  return null;
}

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function ownedList(): OwnedDialerNumber[] {
  const raw = process.env.DIALER_FROM_NUMBERS;
  if (!raw?.trim()) return DEFAULT_OWNED;

  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const e164 = toE164Us(entry);
      if (!e164) return null;
      const known = DEFAULT_OWNED.find((n) => n.e164 === e164);
      if (known) return known;
      const loc = getPhoneLocation(e164);
      const areaCode = usAreaCode(e164) ?? '';
      return {
        e164,
        areaCode,
        state: loc?.state ?? '',
      };
    })
    .filter((n): n is OwnedDialerNumber => !!n);
}

function safeOwnedFallback(owned: OwnedDialerNumber[], fallback: string): string {
  const fb = toE164Us(fallback);
  if (fb && owned.some((n) => n.e164 === fb)) return fb;
  return owned[0]?.e164 ?? fallback;
}

/**
 * Pick the owned Twilio caller ID closest to the lead.
 * Order: same area code → same state → nearest owned number by haversine → fallback.
 * Never returns a number that is not in the owned list.
 */
export function pickDialerCallerId(toE164: string, fallback: string): string {
  const owned = ownedList();
  const safeFallback = safeOwnedFallback(owned, fallback);

  const dest = toE164Us(toE164);
  if (!dest) return safeFallback;

  const loc = getPhoneLocation(dest);
  if (!loc) return safeFallback;

  const leadArea = usAreaCode(dest);
  if (leadArea) {
    const byArea = owned.find((n) => n.areaCode === leadArea);
    if (byArea) return byArea.e164;
  }

  const byState = owned.find((n) => n.state && n.state === loc.state);
  if (byState) return byState.e164;

  const centroid = STATE_CENTROIDS[loc.state];
  if (!centroid) return safeFallback;

  let best = safeFallback;
  let bestDist = Infinity;
  for (const n of owned) {
    if (n.lat == null || n.lng == null) continue;
    const d = haversineMiles(centroid.lat, centroid.lng, n.lat, n.lng);
    if (d < bestDist) {
      bestDist = d;
      best = n.e164;
    }
  }
  return best;
}
