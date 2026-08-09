/**
 * Persistenter Spielstand im localStorage.
 *
 * Zwei Ebenen, wie im Design beschrieben:
 *   - `trip`       — die laufende Fahrt, trägt die Punkte
 *   - `collection` — die fahrtübergreifende Lebensliste, trägt die Achievements
 */

import type { LatLon } from './geo';

const KEY = 'kennzeichenjagd.v2';

export interface Find {
  code: string;
  km: number;
  points: number;
  at: number;
  /** Eigener Standort im Moment des Fundes. */
  from: LatLon;
  /** War es der allererste Fund dieses Kennzeichens überhaupt? */
  firstEver: boolean;
}

export interface Trip {
  id: string;
  startedAt: number;
  finds: Find[];
  /** Nur bei ausdrücklich beendeten Fahrten gesetzt (siehe `endTrip`). */
  endedAt?: number;
}

export interface TripSummary {
  id: string;
  startedAt: number;
  endedAt: number;
  points: number;
  finds: number;
}

export interface Settings {
  /** Kantenlänge der Umgebungskarte an der längeren Seite, in Kilometern. */
  radiusKm: number;
  /**
   * Von Hand gesetzter Standort. Bleibt erhalten, solange nicht auf den
   * Gerätestandort zurückgeschaltet wird — wer ohne Empfang oder ohne
   * Freigabe spielt, will ihn nicht bei jedem Start neu suchen.
   */
  manualPosition: LatLon | null;
}

export interface SaveData {
  version: 2;
  trip: Trip | null;
  collection: Record<string, { firstAt: number; times: number }>;
  achievements: Record<string, number>;
  history: TripSummary[];
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = { radiusKm: 100, manualPosition: null };

function emptySave(): SaveData {
  return {
    version: 2,
    trip: null,
    collection: {},
    achievements: {},
    history: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptySave();
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    const base = emptySave();
    return {
      ...base,
      ...parsed,
      version: 2,
      collection: parsed.collection ?? base.collection,
      achievements: parsed.achievements ?? base.achievements,
      history: parsed.history ?? base.history,
      settings: { ...base.settings, ...parsed.settings },
    };
  } catch {
    return emptySave();
  }
}

type Listener = (data: SaveData) => void;

class Store {
  private data: SaveData = load();
  private listeners = new Set<Listener>();

  get state(): Readonly<SaveData> {
    return this.data;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private commit(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // Speicher voll oder blockiert — das Spiel läuft trotzdem weiter.
    }
    for (const fn of this.listeners) fn(this.data);
  }

  /* ---------- Fahrt ---------- */

  /**
   * Schreibt eine Fahrt in die Historie. Fahrten ohne Fund sind nichts wert
   * und werden stillschweigend verworfen.
   */
  private archive(trip: Trip, endedAt: number): void {
    if (!trip.finds.length) return;
    this.data.history.unshift({
      id: trip.id,
      startedAt: trip.startedAt,
      endedAt,
      points: tripPoints(trip),
      finds: trip.finds.length,
    });
    this.data.history = this.data.history.slice(0, 50);
  }

  startTrip(): Trip {
    const old = this.data.trip;
    // Ohne ausdrückliches Beenden endet die alte Fahrt mit ihrem letzten Fund.
    if (old) this.archive(old, old.finds[old.finds.length - 1]?.at ?? old.startedAt);
    this.data.trip = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      startedAt: Date.now(),
      finds: [],
    };
    this.commit();
    return this.data.trip;
  }

  /**
   * Beendet die laufende Fahrt und gibt sie samt Endzeitpunkt zurück — die
   * Auswertung zeigt sie danach noch einmal, gespeichert ist nur die Historie.
   */
  endTrip(): Trip | null {
    const trip = this.data.trip;
    if (!trip) return null;
    const ended: Trip = { ...trip, endedAt: Date.now() };
    this.archive(trip, ended.endedAt!);
    this.data.trip = null;
    this.commit();
    return ended;
  }

  /** Registriert einen Fund. Gibt `null` zurück, wenn er in dieser Fahrt schon zählt. */
  addFind(code: string, km: number, points: number, from: LatLon): Find | null {
    const trip = this.data.trip ?? this.startTrip();
    if (trip.finds.some((f) => f.code === code)) return null;

    const entry = this.data.collection[code];
    const firstEver = !entry;
    const now = Date.now();
    this.data.collection[code] = entry
      ? { firstAt: entry.firstAt, times: entry.times + 1 }
      : { firstAt: now, times: 1 };

    const find: Find = { code, km, points, at: now, from, firstEver };
    trip.finds.push(find);
    this.commit();
    return find;
  }

  unlockAchievements(ids: string[]): void {
    if (!ids.length) return;
    const now = Date.now();
    for (const id of ids) this.data.achievements[id] ??= now;
    this.commit();
  }

  updateSettings(patch: Partial<Settings>): void {
    this.data.settings = { ...this.data.settings, ...patch };
    this.commit();
  }

  resetAll(): void {
    this.data = emptySave();
    this.commit();
  }
}

export function tripPoints(trip: Trip | null): number {
  return trip ? trip.finds.reduce((sum, f) => sum + f.points, 0) : 0;
}

/** Fahrzeit: bis zum Ende, bei laufender Fahrt bis jetzt. */
export function tripDurationMs(trip: Trip | null): number {
  if (!trip) return 0;
  return Math.max(0, (trip.endedAt ?? Date.now()) - trip.startedAt);
}

export const store = new Store();
