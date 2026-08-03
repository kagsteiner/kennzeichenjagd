/** Geografie: Entfernungen und die Projektion für die Kartendarstellung. */

export interface LatLon {
  lat: number;
  lon: number;
}

/** Punkt in Kartenkoordinaten. Eine Einheit entspricht ungefähr einem Kilometer. */
export interface Point {
  x: number;
  y: number;
}

const RAD = Math.PI / 180;
const EARTH_R = 6371;

/** Bezugspunkt der Projektion, ungefähr die Mitte Deutschlands. */
const REF = { lat: 51.16, lon: 10.45 };
const KM_PER_DEG_LAT = 110.574;
const KM_PER_DEG_LON = 111.32 * Math.cos(REF.lat * RAD);

/** Luftlinie in Kilometern. */
export function distanceKm(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Äquirektanguläre Projektion, auf Deutschland zugeschnitten. Über diese
 * Ausdehnung ist der Fehler klein genug, und die Kartenkoordinaten sind
 * direkt in Kilometern lesbar — praktisch für Radien und Zoomstufen.
 */
export function project(p: LatLon): Point {
  return {
    x: (p.lon - REF.lon) * KM_PER_DEG_LON,
    y: -(p.lat - REF.lat) * KM_PER_DEG_LAT,
  };
}

export function unproject(p: Point): LatLon {
  return {
    lon: p.x / KM_PER_DEG_LON + REF.lon,
    lat: -p.y / KM_PER_DEG_LAT + REF.lat,
  };
}

/**
 * Himmelsrichtung von a nach b als Kürzel. Bei sehr kurzen Strecken sagt die
 * Richtung nichts mehr aus — dann bleibt sie leer.
 */
export function compass(a: LatLon, b: LatLon): string {
  if (distanceKm(a, b) < 1) return '';
  const dx = (b.lon - a.lon) * KM_PER_DEG_LON;
  const dy = (b.lat - a.lat) * KM_PER_DEG_LAT;
  const deg = (Math.atan2(dx, dy) * 180) / Math.PI;
  const names = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
  return names[Math.round(((deg + 360) % 360) / 45) % 8];
}
