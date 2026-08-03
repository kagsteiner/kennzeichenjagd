/**
 * Baut die statischen Spieldaten:
 *
 *  - src/data/plates.json    Kennzeichen inkl. zugeordnetem Bundesland
 *  - src/data/germany.json   schematische Bundesland-Umrisse (vereinfacht)
 *
 * Quellen: license_plates.csv (Projektwurzel) und scripts/bundeslaender.raw.geo.json
 * (deutschlandGeoJSON, isellsoap — Bundesländer, mittlere Auflösung).
 *
 * Läuft nur beim Datenupdate, nicht zur Laufzeit:  npm run data
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { topology } from 'topojson-server';
import { presimplify, simplify } from 'topojson-simplify';
import { feature } from 'topojson-client';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ---------- CSV ---------- */

function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift().map((h) => h.trim());
  return rows
    .filter((r) => r.some((v) => v.trim() !== ''))
    .map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

/* ---------- Geometrie ---------- */

function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function pointInPolygon(lon, lat, polygon) {
  if (!pointInRing(lon, lat, polygon[0])) return false;
  for (let h = 1; h < polygon.length; h++) if (pointInRing(lon, lat, polygon[h])) return false;
  return true;
}

function polygonsOf(feature) {
  const g = feature.geometry;
  return g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
}

/** Kürzester Abstand (in Grad, grob) von einem Punkt zu allen Ringen. */
function ringDistance(lon, lat, rings) {
  let best = Infinity;
  const kx = Math.cos((lat * Math.PI) / 180);
  for (const ring of rings) {
    for (const [x, y] of ring) {
      const dx = (x - lon) * kx;
      const dy = y - lat;
      const d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
  }
  return Math.sqrt(best);
}

function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return Math.abs(a / 2);
}

/* ---------- Bundesländer ---------- */

const geo = JSON.parse(readFileSync(join(root, 'scripts/bundeslaender.raw.geo.json'), 'utf8'));
const states = geo.features.map((f) => ({
  id: f.properties.id,
  name: f.properties.name,
  polygons: polygonsOf(f),
}));

// Stadtstaaten zuerst prüfen: Berlin liegt in Brandenburg, Bremen in Niedersachsen.
const lookupOrder = [...states].sort((a, b) => {
  const city = (s) => (['DE-BE', 'DE-HB', 'DE-HH'].includes(s.id) ? 0 : 1);
  return city(a) - city(b);
});

function stateAt(lon, lat) {
  for (const s of lookupOrder) {
    for (const poly of s.polygons) if (pointInPolygon(lon, lat, poly)) return s;
  }
  // Punkt knapp außerhalb (Küste, Grenzlage, ungenaue Koordinate): nächstes Bundesland.
  let best = null;
  let bestD = Infinity;
  for (const s of states) {
    const d = ringDistance(lon, lat, s.polygons.flat());
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

/* ---------- plates.json ---------- */

const csv = parseCsv(readFileSync(join(root, 'license_plates.csv'), 'utf8'));
const seen = new Set();
const plates = [];
const rejected = [];
let fallbacks = 0;

// Die Rohtabelle enthält Zeilenartefakte (Datumsangaben, Postleitzahlen,
// ausgeschriebene Kreisnamen). Gültig ist nur ein bis drei Großbuchstaben.
const VALID_CODE = /^[A-ZÄÖÜ]{1,3}$/;

for (const row of csv) {
  const code = row.license_plate.toUpperCase();
  if (!VALID_CODE.test(code) || !row.city_name) { rejected.push(code); continue; }
  if (seen.has(code)) continue;
  seen.add(code);
  const lat = Number(row.latitude);
  const lon = Number(row.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    console.warn(`  ! ${code}: keine Koordinaten, übersprungen`);
    continue;
  }
  let inside = false;
  for (const s of lookupOrder) {
    for (const poly of s.polygons) if (pointInPolygon(lon, lat, poly)) { inside = true; break; }
    if (inside) break;
  }
  if (!inside) fallbacks++;
  const state = stateAt(lon, lat);
  plates.push({
    code,
    city: row.city_name,
    mnemonic: row.plate_name,
    lat: Math.round(lat * 1e4) / 1e4,
    lon: Math.round(lon * 1e4) / 1e4,
    state: state.id,
  });
}

plates.sort((a, b) => a.code.localeCompare(b.code, 'de'));
writeFileSync(join(root, 'src/data/plates.json'), JSON.stringify(plates), 'utf8');

/* ---------- germany.json (schematisch) ---------- */

/*
 * Vereinfachung über eine Topologie statt Polygon für Polygon: gemeinsame
 * Grenzen sind dort ein einziger Kantenzug und bleiben nach dem Ausdünnen
 * deckungsgleich. Vereinfacht man jedes Land für sich, driften Nachbarn
 * auseinander und es klaffen Lücken.
 */
// Schwelle in Quadratgrad: Stützpunkte, deren Wegfall die Fläche um weniger
// als das verändert, fliegen raus (rund 6 km² — schematisch, aber lesbar).
const MIN_WEIGHT = 0.0008;
const MIN_AREA = 0.004;     // kleine Inseln und Exklaven fallen weg

const topo = presimplify(topology(Object.fromEntries(
  geo.features.map((f) => [f.properties.id, { type: 'FeatureCollection', features: [f] }]),
)));
const simplified = simplify(topo, MIN_WEIGHT);

const shapes = states.map((s) => {
  const collection = feature(simplified, simplified.objects[s.id]);
  const geom = collection.features[0].geometry;
  const polygons = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;

  let rings = polygons
    .map((poly) => poly[0])
    .filter((ring) => ring.length >= 4 && ringArea(ring) >= MIN_AREA)
    .map((ring) => ring.map(([lon, lat]) => [Math.round(lon * 1e3) / 1e3, Math.round(lat * 1e3) / 1e3]));

  // Stadtstaaten sind so klein, dass sie sonst ganz verschwinden.
  if (!rings.length) {
    const biggest = polygons.map((p) => p[0]).sort((a, b) => ringArea(b) - ringArea(a))[0];
    rings = [biggest.map(([lon, lat]) => [Math.round(lon * 1e4) / 1e4, Math.round(lat * 1e4) / 1e4])];
  }

  return { id: s.id, name: s.name, rings, plateCount: plates.filter((p) => p.state === s.id).length };
});

writeFileSync(join(root, 'src/data/germany.json'), JSON.stringify({ states: shapes }), 'utf8');

/* ---------- Report ---------- */

const byState = new Map();
for (const p of plates) byState.set(p.state, (byState.get(p.state) ?? 0) + 1);
console.log(`${plates.length} Kennzeichen, ${fallbacks} per Nächster-Nachbar zugeordnet, ${rejected.length} Zeilen verworfen`);
for (const s of states) console.log(`  ${s.id} ${s.name.padEnd(24)} ${String(byState.get(s.id) ?? 0).padStart(3)}`);
const pts = shapes.reduce((n, s) => n + s.rings.reduce((m, r) => m + r.length, 0), 0);
console.log(`Karte: ${pts} Stützpunkte, ${(JSON.stringify(shapes).length / 1024).toFixed(0)} kB`);
