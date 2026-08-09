/**
 * Punkte hängen allein an der Entfernung zwischen aktuellem Standort und der
 * Heimatstadt des Kennzeichens: ein Punkt je zehn Kilometer, mindestens einer.
 *
 * Bewusst keine Boni — insbesondere nicht für Erstfunde (siehe Design, 2.).
 */
export const KM_PER_POINT = 10;

export function pointsFor(km: number): number {
  return Math.max(1, Math.round(km / KM_PER_POINT));
}

/** Grobe Einordnung eines Fundes, nur für die Anzeige. */
export function findTier(km: number): 'nah' | 'fern' | 'weit' {
  if (km < 60) return 'nah';
  if (km < 250) return 'fern';
  return 'weit';
}

/* ---------- Punkte je Stunde: die eigentliche Maßzahl einer Fahrt ---------- */

/**
 * Die reine Punktzahl belohnt vor allem lange Fahrten. Interessant ist aber,
 * wie dicht gejagt wurde — deshalb rechnet die Fahrtwertung in Punkten je
 * Stunde Fahrzeit. Aus der Praxis: 1000 ist ein schöner Erfolg, 3000 super,
 * darüber wird es selten.
 */
export interface RateTier {
  min: number;
  label: string;
  icon: string;
}

export const RATE_TIERS: RateTier[] = [
  { min: 0, label: 'Aufgewärmt', icon: '🌱' },
  { min: 500, label: 'In Fahrt', icon: '🚗' },
  { min: 1000, label: 'Schöner Erfolg', icon: '⭐' },
  { min: 2000, label: 'Stark', icon: '🔥' },
  { min: 3000, label: 'Super', icon: '🚀' },
  { min: 5000, label: 'Überragend', icon: '🏆' },
  { min: 10000, label: 'Unglaublich', icon: '👑' },
];

/**
 * Kurze Fahrten würden sonst absurde Werte liefern — die erste Minute zählt
 * deshalb als volle Minute und darunter wird nicht gerechnet.
 */
export const MIN_RATED_MS = 60_000;

export function pointsPerHour(points: number, durationMs: number): number {
  return Math.round((points * 3_600_000) / Math.max(MIN_RATED_MS, durationMs));
}

export function pointsPerMinute(points: number, durationMs: number): number {
  return (points * 60_000) / Math.max(MIN_RATED_MS, durationMs);
}

export function rateTier(perHour: number): RateTier {
  let tier = RATE_TIERS[0];
  for (const t of RATE_TIERS) if (perHour >= t.min) tier = t;
  return tier;
}

/** Die nächsthöhere Stufe — für die Fortschrittsanzeige. `null` an der Spitze. */
export function nextRateTier(perHour: number): RateTier | null {
  return RATE_TIERS.find((t) => t.min > perHour) ?? null;
}
