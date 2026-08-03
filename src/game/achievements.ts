/**
 * Achievements hängen ausschließlich an der Lebensliste (Ebene 2) und geben
 * niemals Punkte — sie sollen die Fahrtwertung nicht verzerren.
 */

import { plateByCode, STATES, STATE_NAMES } from './plates';
import type { SaveData } from './store';

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
}

/** Meilensteine der Sammlung. 100/200/300 … aus dem Design, davor zwei kleine Einstiege. */
export const MILESTONES = [10, 50, 100, 200, 300, 400, 500, 600, 700];

export function describe(id: string): Achievement {
  if (id.startsWith('state:')) {
    const state = id.slice(6);
    return {
      id,
      title: STATE_NAMES[state] ?? state,
      description: `Erstes Kennzeichen aus ${STATE_NAMES[state] ?? state}`,
      icon: '🚩',
    };
  }
  if (id.startsWith('count:')) {
    const n = Number(id.slice(6));
    return {
      id,
      title: `${n} Kennzeichen`,
      description: `${n} verschiedene Kennzeichen gesammelt`,
      icon: '⭐',
    };
  }
  if (id === 'all-states') {
    return {
      id,
      title: 'Ganz Deutschland',
      description: 'Aus allen 16 Bundesländern mindestens ein Kennzeichen',
      icon: '🏆',
    };
  }
  return { id, title: id, description: '', icon: '✨' };
}

/** Alle Achievements, die der aktuelle Sammlungsstand rechtfertigt. */
export function earned(collection: SaveData['collection']): string[] {
  const codes = Object.keys(collection);
  const ids: string[] = [];

  const states = new Set<string>();
  for (const code of codes) {
    const plate = plateByCode(code);
    if (plate) states.add(plate.state);
  }
  for (const state of states) ids.push(`state:${state}`);
  if (states.size >= STATES.length) ids.push('all-states');

  for (const m of MILESTONES) if (codes.length >= m) ids.push(`count:${m}`);

  return ids;
}

/** Was durch den letzten Fund neu dazugekommen ist. */
export function newlyEarned(data: SaveData): string[] {
  return earned(data.collection).filter((id) => !(id in data.achievements));
}

/** Nächster Sammlungs-Meilenstein, für die Fortschrittsanzeige. */
export function nextMilestone(count: number): number | null {
  return MILESTONES.find((m) => m > count) ?? null;
}
