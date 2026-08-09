/** App-Schale: Startbildschirm und Wechsel zwischen den drei Ansichten. */

import { store, tripDurationMs, tripPoints, type Trip } from '../game/store';
import { PLATES } from '../game/plates';
import { pointsPerHour } from '../game/scoring';
import { formatBuildTime, formatClock, formatDuration, formatNumber, h } from './dom';
import { DriveScreen } from './drive';
import { createCollectionScreen } from './collection';
import { createSummaryScreen } from './summary';
import { openSettings } from './settings';
import titleSrc from '../assets/title.png';

type Screen = { root: HTMLElement; destroy?: () => void };

export function mountApp(root: HTMLElement): void {
  let current: Screen | null = null;

  const show = (screen: Screen): void => {
    current?.destroy?.();
    current = screen;
    root.replaceChildren(screen.root);
  };

  const goStart = () =>
    show(createStartScreen({ onDrive: goDrive, onCollection: goCollection, onEnd: goSummary }));
  const goDrive = () => show(new DriveScreen(goStart, goCollection));
  const goCollection = () => show(createCollectionScreen(goStart));
  const goSummary = (trip: Trip) => show(createSummaryScreen(trip, goStart));

  goStart();
}

interface StartOptions {
  onDrive: () => void;
  onCollection: () => void;
  onEnd: (trip: Trip) => void;
}

function createStartScreen({ onDrive, onCollection, onEnd }: StartOptions): Screen {
  const trip = store.state.trip;
  const collected = Object.keys(store.state.collection).length;

  const resume =
    trip &&
    h(
      'button',
      { class: 'btn btn-primary btn-big', onclick: onDrive },
      h('span', { class: 'btn-title' }, 'Fahrt fortsetzen'),
      h(
        'span',
        { class: 'btn-sub' },
        `${tripPoints(trip)} Punkte · ${trip.finds.length} ${trip.finds.length === 1 ? 'Fund' : 'Funde'} · ` +
          `seit ${formatClock(trip.startedAt)} (${formatDuration(Date.now() - trip.startedAt)})`,
      ),
    );

  // Beenden gibt es nur zur laufenden Fahrt; danach steht wieder „Neue Fahrt“ da.
  const end =
    trip &&
    h(
      'button',
      {
        class: 'btn btn-big',
        onclick: () => {
          const ended = store.endTrip();
          if (ended) onEnd(ended);
        },
      },
      h('span', { class: 'btn-title' }, 'Fahrt beenden'),
      h(
        'span',
        { class: 'btn-sub' },
        trip.finds.length
          ? `Auswertung ansehen — ${formatNumber(pointsPerHour(tripPoints(trip), tripDurationMs(trip)))} Punkte je Stunde`
          : 'Auswertung ansehen',
      ),
    );

  const startNew =
    !trip &&
    h(
      'button',
      {
        class: 'btn btn-big btn-primary',
        onclick: () => {
          store.startTrip();
          onDrive();
        },
      },
      h('span', { class: 'btn-title' }, 'Neue Fahrt'),
      h('span', { class: 'btn-sub' }, 'Punkte beginnen wieder bei null'),
    );

  const root = h(
    'div',
    { class: 'screen screen-start' },
    h(
      'div',
      { class: 'start-inner' },
      h('img', { class: 'logo-img', src: titleSrc, alt: 'Kennzeichenjagd' }),
      h(
        'p',
        { class: 'lead' },
        'Fremde Kennzeichen eintippen. Je weiter ihre Heimat entfernt ist, desto mehr Punkte.',
      ),
      h('div', { class: 'start-actions' }, resume || null, end || null, startNew || null),
      h(
        'div',
        { class: 'start-links' },
        h('button', { class: 'link', onclick: onCollection }, `Sammlung — ${collected} von ${PLATES.length}`),
        h('button', { class: 'link', onclick: () => openSettings(root) }, 'Einstellungen'),
      ),
      h('p', { class: 'fineprint' }, 'Für Beifahrer und Mitfahrende. Nicht für die Person am Steuer.'),
      h('p', { class: 'build-info' }, `Build vom ${formatBuildTime()}`),
    ),
  );

  return { root };
}
