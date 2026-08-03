/**
 * Die Sammlung — Ebene 2: alles, was je gefunden wurde, über ganz Deutschland,
 * dazu Achievements und Fahrtenhistorie. Punkte gibt es hier keine.
 */

import { describe, earned, MILESTONES, nextMilestone } from '../game/achievements';
import { PLATES, STATES, plateByCode, type Plate } from '../game/plates';
import { store } from '../game/store';
import { formatDate, formatDuration, h } from './dom';
import { MapView, type Marker } from './map';

export function createCollectionScreen(onBack: () => void): { root: HTMLElement; destroy: () => void } {
  const data = store.state;
  const collected = new Set(Object.keys(data.collection));
  const collectedStates = new Set(
    [...collected].map((code) => plateByCode(code)?.state).filter((s): s is string => Boolean(s)),
  );

  const mapHost = h('div', { class: 'map-host map-host-static' });
  const markers: Marker[] = [...collected]
    .map((code) => plateByCode(code))
    .filter((p): p is Plate => Boolean(p))
    .map((p) => ({ code: p.code, lat: p.lat, lon: p.lon, kind: 'life' as const }));

  const stats = h(
    'div',
    { class: 'stats' },
    stat(String(collected.size), `von ${PLATES.length} Kennzeichen`),
    stat(`${collectedStates.size}/16`, 'Bundesländer'),
    stat(String(Object.keys(data.achievements).length), 'Achievements'),
  );

  const next = nextMilestone(collected.size);
  const progress = next
    ? h(
        'div',
        { class: 'progress' },
        h('div', { class: 'progress-bar' }, h('span', { style: `width:${(collected.size / next) * 100}%` })),
        h('p', { class: 'progress-note' }, `Noch ${next - collected.size} bis ${next} verschiedene Kennzeichen.`),
      )
    : h('p', { class: 'progress-note' }, 'Alle Meilensteine erreicht.');

  const root = h(
    'div',
    { class: 'screen screen-collection' },
    h(
      'header',
      { class: 'bar' },
      h('button', { class: 'icon-btn', onclick: onBack }, '‹'),
      h('h1', {}, 'Sammlung'),
      h('span', { class: 'bar-spacer' }),
    ),
    h(
      'div',
      { class: 'scroll' },
      mapHost,
      stats,
      progress,
      achievementSection(data.achievements),
      stateSection(collected),
      historySection(),
    ),
  );

  const map = new MapView(mapHost);
  map.autoFit = true;
  map.setStateProgress(collectedStates);
  map.setMarkers(markers);
  map.setView(map.germanyView());

  return { root, destroy: () => map.stopAnimation() };
}

function stat(value: string, label: string): HTMLElement {
  return h('div', { class: 'stat' }, h('strong', {}, value), h('span', {}, label));
}

function achievementSection(unlocked: Record<string, number>): HTMLElement {
  const all = [
    ...STATES.map((s) => `state:${s.id}`),
    'all-states',
    ...MILESTONES.map((m) => `count:${m}`),
  ];
  const done = new Set(earned(store.state.collection));

  return h(
    'section',
    { class: 'block' },
    h('h2', {}, 'Achievements'),
    h('p', { class: 'block-note' }, 'Ehrensache statt Punkte — Achievements verändern die Fahrtwertung nicht.'),
    h(
      'div',
      { class: 'badges' },
      ...all.map((id) => {
        const a = describe(id);
        const isDone = done.has(id) || id in unlocked;
        return h(
          'div',
          { class: `badge${isDone ? ' is-done' : ''}`, title: a.description },
          h('span', { class: 'badge-icon' }, a.icon),
          h('span', { class: 'badge-title' }, a.title),
          isDone && unlocked[id]
            ? h('span', { class: 'badge-date' }, formatDate(unlocked[id]))
            : h('span', { class: 'badge-date' }, isDone ? '' : 'offen'),
        );
      }),
    ),
  );
}

function stateSection(collected: Set<string>): HTMLElement {
  const section = h('section', { class: 'block' }, h('h2', {}, 'Nach Bundesland'));

  for (const state of STATES) {
    const plates = PLATES.filter((p) => p.state === state.id);
    const have = plates.filter((p) => collected.has(p.code)).length;
    const details = h(
      'details',
      { class: 'state-group' },
      h(
        'summary',
        {},
        h('span', { class: 'state-name' }, state.name),
        h('span', { class: `state-count${have === plates.length ? ' is-complete' : ''}` }, `${have}/${plates.length}`),
      ),
      h(
        'div',
        { class: 'chips' },
        ...plates.map((p) =>
          h(
            'span',
            {
              class: `chip${collected.has(p.code) ? ' is-found' : ''}`,
              title: `${p.city} · ${p.mnemonic}`,
            },
            p.code,
          ),
        ),
      ),
    );
    section.append(details);
  }
  return section;
}

function historySection(): HTMLElement {
  const history = store.state.history;
  const current = store.state.trip;
  const section = h('section', { class: 'block' }, h('h2', {}, 'Fahrten'));

  if (current && current.finds.length) {
    section.append(
      h(
        'div',
        { class: 'trip-row is-current' },
        h('span', {}, 'Laufende Fahrt'),
        h('span', {}, `${current.finds.length} Funde`),
        h('strong', {}, `${current.finds.reduce((s, f) => s + f.points, 0)} P`),
      ),
    );
  }

  if (!history.length && !current?.finds.length) {
    section.append(h('p', { class: 'block-note' }, 'Noch keine abgeschlossene Fahrt.'));
    return section;
  }

  for (const trip of history) {
    section.append(
      h(
        'div',
        { class: 'trip-row' },
        h(
          'span',
          {},
          `${formatDate(trip.startedAt)} · ${formatDuration(Math.max(60000, trip.endedAt - trip.startedAt))}`,
        ),
        h('span', {}, `${trip.finds} Funde`),
        h('strong', {}, `${trip.points} P`),
      ),
    );
  }
  return section;
}
