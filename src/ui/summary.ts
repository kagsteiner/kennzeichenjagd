/**
 * Die Auswertung einer beendeten Fahrt.
 *
 * Im Mittelpunkt steht nicht die reine Punktzahl — die wächst mit jeder
 * Stunde von allein — sondern die Ausbeute je Stunde Fahrzeit. Darunter die
 * Karte der Fahrt und die Liste der Funde.
 */

import { plateByCode, type Plate } from '../game/plates';
import {
  nextRateTier,
  pointsPerHour,
  pointsPerMinute,
  rateTier,
  findTier,
} from '../game/scoring';
import { tripDurationMs, tripPoints, type Trip } from '../game/store';
import { formatDuration, formatKm, formatNumber, h } from './dom';
import { MapView, type Marker } from './map';
import { toast } from './toast';

export function createSummaryScreen(trip: Trip, onHome: () => void): { root: HTMLElement; destroy: () => void } {
  const points = tripPoints(trip);
  const durationMs = tripDurationMs(trip);
  const perHour = pointsPerHour(points, durationMs);
  const perMinute = pointsPerMinute(points, durationMs);
  const tier = rateTier(perHour);
  const next = nextRateTier(perHour);

  const finds = [...trip.finds].sort((a, b) => b.points - a.points);
  const farthest = finds[0];
  const firstEver = trip.finds.filter((f) => f.firstEver).length;

  const mapHost = h('div', { class: 'map-host map-host-static' });
  const mapOverlay = h('div', { class: 'find-overlay', 'aria-live': 'polite' });
  const mapWrap = h('div', { class: 'map-wrap' }, mapHost, mapOverlay);
  const markers: Marker[] = trip.finds
    .map((f) => plateByCode(f.code))
    .filter((p): p is Plate => Boolean(p))
    .map((p) => ({ code: p.code, lat: p.lat, lon: p.lon, kind: 'trip' as const }));

  /** Tipp auf ein Fähnchen: dieselbe Fund-Karte wie live während der Fahrt. */
  let cardCode: string | null = null;
  const hideMapCard = (): void => {
    if (!cardCode) return;
    cardCode = null;
    mapOverlay.classList.remove('is-interactive');
    const card = mapOverlay.firstElementChild;
    if (!card) return;
    card.classList.remove('is-in');
    setTimeout(() => card.remove(), 320);
  };
  const showMapCard = (code: string): void => {
    if (cardCode === code) return hideMapCard();
    const plate = plateByCode(code);
    const find = trip.finds.find((f) => f.code === code);
    if (!plate || !find) return;

    const card = h(
      'div',
      { class: `find-card tier-${findTier(find.km)}`, onclick: (ev: Event) => ev.stopPropagation() },
      find.firstEver ? h('div', { class: 'find-new' }, 'Neu entdeckt!') : null,
      h('div', { class: 'find-code' }, plate.code),
      h('div', { class: 'find-mnemonic' }, plate.mnemonic),
      h('div', { class: 'find-city' }, plate.city),
      h('div', { class: 'find-distance' }, formatKm(find.km)),
      h('div', { class: 'find-points' }, `+${find.points}`),
    );

    mapOverlay.classList.add('is-interactive');
    mapOverlay.replaceChildren(card);
    cardCode = code;
    requestAnimationFrame(() => card.classList.add('is-in'));
  };

  /* Fortschritt innerhalb der aktuellen Stufe — ganz oben ist der Balken voll. */
  const span = next ? next.min - tier.min : 1;
  const fill = next ? Math.min(1, Math.max(0, (perHour - tier.min) / span)) : 1;

  const rateCard = h(
    'div',
    { class: 'rate-card' },
    h('div', { class: 'rate-icon' }, tier.icon),
    h(
      'div',
      { class: 'rate-value' },
      h('strong', {}, formatNumber(perHour)),
      h('span', { class: 'rate-unit' }, 'Punkte je Stunde'),
    ),
    h('div', { class: 'rate-label' }, tier.label),
    h('div', { class: 'progress-bar' }, h('span', { style: `width:${fill * 100}%` })),
    h(
      'p',
      { class: 'progress-note' },
      next
        ? `Noch ${formatNumber(next.min - perHour)} bis „${next.label}“ (${formatNumber(next.min)} je Stunde).`
        : 'Höchste Stufe erreicht.',
    ),
    h(
      'p',
      { class: 'rate-fine' },
      `Das sind ${perMinute.toFixed(1).replace('.', ',')} Punkte je Minute Fahrzeit.`,
    ),
  );

  const stats = h(
    'div',
    { class: 'stats' },
    stat(formatNumber(points), 'Punkte'),
    stat(String(trip.finds.length), trip.finds.length === 1 ? 'Fund' : 'Funde'),
    stat(formatDuration(durationMs), 'Fahrzeit'),
  );

  const highlights = h(
    'div',
    { class: 'summary-highlights' },
    farthest
      ? h(
          'p',
          {},
          'Weitester Fund: ',
          h('strong', {}, farthest.code),
          ` — ${plateByCode(farthest.code)?.city ?? ''}, ${formatKm(farthest.km)} für ${farthest.points} Punkte.`,
        )
      : null,
    firstEver
      ? h('p', {}, `${firstEver} ${firstEver === 1 ? 'Kennzeichen war' : 'Kennzeichen waren'} neu in der Sammlung.`)
      : null,
  );

  const shareBtn = h(
    'button',
    { class: 'btn', onclick: () => void share(trip, points, durationMs, perHour, tier.label) },
    'Ergebnis teilen',
  );

  const root = h(
    'div',
    { class: 'screen screen-summary' },
    h(
      'header',
      { class: 'bar' },
      h('button', { class: 'icon-btn', onclick: onHome }, '‹'),
      h('h1', {}, 'Fahrt beendet'),
      h('span', { class: 'bar-spacer' }),
    ),
    h(
      'div',
      { class: 'scroll' },
      trip.finds.length
        ? rateCard
        : h('p', { class: 'block-note' }, 'Diese Fahrt blieb ohne Fund — sie zählt nicht in der Historie.'),
      stats,
      trip.finds.length ? mapWrap : null,
      highlights,
      trip.finds.length ? findList(finds) : null,
      h(
        'div',
        { class: 'summary-actions' },
        trip.finds.length ? shareBtn : null,
        h('button', { class: 'btn btn-primary', onclick: onHome }, 'Fertig'),
      ),
    ),
  );

  let map: MapView | null = null;
  if (trip.finds.length) {
    map = new MapView(mapHost);
    map.autoFit = true;
    map.gestures = true;
    map.onMarkerClick = (code) => showMapCard(code);
    // Sobald von Hand gezoomt oder geschoben wird, darf ein Resize (auf dem
    // Handy etwa durch die ein-/ausklappende Adressleiste beim Scrollen)
    // die Geste nicht mehr mit einem Rücksprung auf die Gesamtansicht stören.
    map.onUserView = () => {
      if (map) map.autoFit = false;
    };
    mapHost.addEventListener('click', () => hideMapCard());
    map.setMarkers(markers);
    map.setView(map.germanyView());
  }

  return { root, destroy: () => map?.stopAnimation() };
}

function stat(value: string, label: string): HTMLElement {
  return h('div', { class: 'stat' }, h('strong', {}, value), h('span', {}, label));
}

function findList(finds: Trip['finds']): HTMLElement {
  return h(
    'section',
    { class: 'block' },
    h('h2', {}, 'Alle Funde'),
    ...finds.map((f) => {
      const plate = plateByCode(f.code);
      return h(
        'div',
        { class: `trip-row find-row tier-${findTier(f.km)}` },
        h('span', { class: 'find-row-code' }, f.code),
        h(
          'span',
          { class: 'find-row-text' },
          h('span', {}, plate?.city ?? ''),
          h('span', { class: 'find-row-km' }, formatKm(f.km)),
        ),
        h('strong', {}, `+${f.points}`),
      );
    }),
  );
}

/** Teilen über das System-Blatt; wo es das nicht gibt, in die Zwischenablage. */
async function share(
  trip: Trip,
  points: number,
  durationMs: number,
  perHour: number,
  label: string,
): Promise<void> {
  const best = [...trip.finds].sort((a, b) => b.points - a.points)[0];
  const text =
    `Kennzeichenjagd: ${formatNumber(points)} Punkte in ${formatDuration(durationMs)} — ` +
    `${formatNumber(perHour)} Punkte je Stunde (${label}). ` +
    `${trip.finds.length} ${trip.finds.length === 1 ? 'Kennzeichen' : 'Kennzeichen'}` +
    (best ? `, weitester Fund ${best.code} über ${formatKm(best.km)}.` : '.');

  try {
    if (navigator.share) {
      await navigator.share({ title: 'Kennzeichenjagd', text });
      return;
    }
    await navigator.clipboard.writeText(text);
    toast('Ergebnis in die Zwischenablage kopiert.');
  } catch {
    // Abgebrochen oder blockiert — dann bleibt einfach alles, wie es war.
  }
}
