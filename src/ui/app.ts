/** App-Schale: Startbildschirm und Wechsel zwischen den drei Ansichten. */

import { store, tripPoints } from '../game/store';
import { PLATES } from '../game/plates';
import { formatBuildTime, formatClock, formatDuration, h } from './dom';
import { DriveScreen } from './drive';
import { createCollectionScreen } from './collection';
import { openSettings } from './settings';

type Screen = { root: HTMLElement; destroy?: () => void };

export function mountApp(root: HTMLElement): void {
  let current: Screen | null = null;

  const show = (screen: Screen): void => {
    current?.destroy?.();
    current = screen;
    root.replaceChildren(screen.root);
  };

  const goStart = () => show(createStartScreen({ onDrive: goDrive, onCollection: goCollection }));
  const goDrive = () => show(new DriveScreen(goStart, goCollection));
  const goCollection = () => show(createCollectionScreen(goStart));

  goStart();
}

interface StartOptions {
  onDrive: () => void;
  onCollection: () => void;
}

function createStartScreen({ onDrive, onCollection }: StartOptions): Screen {
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

  const startNew = h(
    'button',
    {
      class: `btn btn-big${trip ? '' : ' btn-primary'}`,
      onclick: () => {
        if (trip && trip.finds.length && !confirm('Laufende Fahrt beenden und neu anfangen?')) return;
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
      h('h1', { class: 'logo' }, 'Kennzeichen', h('span', {}, 'jagd')),
      h(
        'p',
        { class: 'lead' },
        'Fremde Kennzeichen eintippen. Je weiter ihre Heimat entfernt ist, desto mehr Punkte.',
      ),
      h('div', { class: 'start-actions' }, resume || null, startNew),
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
