/** Kennzeichen-Stammdaten, Suchbaum für die Tastatur und die Nähe-Liste. */

import platesJson from '../data/plates.json';
import germanyJson from '../data/germany.json';
import { distanceKm, type LatLon } from './geo';

export interface Plate {
  /** Unterscheidungszeichen, z. B. "HD". */
  code: string;
  /** Stadt oder Kreis, zu der das Kennzeichen gehört. */
  city: string;
  /** Erläuterung der Buchstaben, z. B. "MuldenTaL". */
  mnemonic: string;
  lat: number;
  lon: number;
  /** ISO-Kürzel des Bundeslands, z. B. "DE-BW". */
  state: string;
}

export interface StateShape {
  id: string;
  name: string;
  rings: [number, number][][];
  plateCount: number;
}

export const PLATES = platesJson as Plate[];
export const STATES = (germanyJson as { states: StateShape[] }).states;

export const STATE_NAMES: Record<string, string> = Object.fromEntries(
  STATES.map((s) => [s.id, s.name]),
);

const byCode = new Map<string, Plate>(PLATES.map((p) => [p.code, p]));

export function plateByCode(code: string): Plate | undefined {
  return byCode.get(code.toUpperCase());
}

/* ---------- Suchbaum für die mitdenkende Tastatur ---------- */

interface TrieNode {
  next: Map<string, TrieNode>;
  /** Kennzeichen, das genau hier endet. */
  plate?: Plate;
}

const trie: TrieNode = { next: new Map() };
for (const plate of PLATES) {
  let node = trie;
  for (const ch of plate.code) {
    let child = node.next.get(ch);
    if (!child) {
      child = { next: new Map() };
      node.next.set(ch, child);
    }
    node = child;
  }
  node.plate = plate;
}

function nodeAt(prefix: string): TrieNode | undefined {
  let node: TrieNode | undefined = trie;
  for (const ch of prefix) {
    node = node?.next.get(ch);
    if (!node) return undefined;
  }
  return node;
}

/** Welche Buchstaben führen nach diesem Präfix noch zu einem Kennzeichen? */
export function nextLetters(prefix: string): Set<string> {
  return new Set(nodeAt(prefix)?.next.keys() ?? []);
}

/** Das Kennzeichen, das exakt diesem Präfix entspricht — falls es eines gibt. */
export function exactPlate(prefix: string): Plate | undefined {
  return nodeAt(prefix)?.plate;
}

/**
 * Tastaturlayout: A–Z in gewohnter Reihenfolge, Umlaute hinten angehängt.
 * Ä, Ö und Ü kommen in Kennzeichen vor (ÜB, ÖHR, AÖ), aber selten genug,
 * dass sie das vertraute Alphabet nicht unterbrechen sollten.
 */
export const ALPHABET: string[] = (() => {
  const used = new Set(PLATES.flatMap((p) => [...p.code]));
  const basic = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].filter((c) => used.has(c));
  const umlauts = [...'ÄÖÜ'].filter((c) => used.has(c));
  return [...basic, ...umlauts];
})();

/* ---------- Nähe-Liste ---------- */

export interface NearbyEntry {
  plate: Plate;
  km: number;
}

/**
 * Kennzeichen nach Entfernung zum Standort, nächste zuerst. Bei gut 700
 * Einträgen ist die vollständige Neuberechnung in Millisekunden erledigt —
 * getaktet wird trotzdem, siehe location.ts.
 */
export function nearby(from: LatLon, limit = 40, exclude?: ReadonlySet<string>): NearbyEntry[] {
  const list: NearbyEntry[] = [];
  for (const plate of PLATES) {
    if (exclude?.has(plate.code)) continue;
    list.push({ plate, km: distanceKm(from, plate) });
  }
  list.sort((a, b) => a.km - b.km);
  return list.slice(0, limit);
}
