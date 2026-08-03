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
