/** Einstellungen als Overlay: Kartenradius, Standort, Daten. */

import { location } from '../game/location';
import { PLATES } from '../game/plates';
import { KM_PER_POINT } from '../game/scoring';
import { store } from '../game/store';
import { h } from './dom';
import { toast } from './toast';

const RADIUS_MIN = 40;
const RADIUS_MAX = 400;

export function openSettings(parent: HTMLElement): void {
  const close = () => overlay.remove();

  const radiusValue = h('output', { class: 'range-value' }, `${store.state.settings.radiusKm} km`);
  const radius = h('input', {
    type: 'range',
    min: RADIUS_MIN,
    max: RADIUS_MAX,
    step: 10,
    value: store.state.settings.radiusKm,
    oninput: (ev) => {
      const km = Number((ev.target as HTMLInputElement).value);
      radiusValue.textContent = `${km} km`;
      store.updateSettings({ radiusKm: km });
    },
  });

  const cityList = h('datalist', { id: 'city-options' });
  for (const plate of PLATES) {
    cityList.append(h('option', { value: `${plate.city} (${plate.code})` }));
  }

  const cityInput = h('input', {
    type: 'text',
    list: 'city-options',
    placeholder: 'Ort suchen, z. B. Heidelberg',
    class: 'text-input',
  });

  const setManual = () => {
    const query = cityInput.value.trim().toLowerCase();
    if (!query) return;
    const match =
      PLATES.find((p) => `${p.city} (${p.code})`.toLowerCase() === query) ??
      PLATES.find((p) => p.city.toLowerCase().startsWith(query)) ??
      PLATES.find((p) => p.city.toLowerCase().includes(query));
    if (!match) {
      toast('Kein Ort mit diesem Namen gefunden.');
      return;
    }
    location.setManual({ lat: match.lat, lon: match.lon });
    toast(`Standort: ${match.city}`);
    close();
  };

  const locationStatus = h('p', { class: 'setting-note' }, locationText());

  const overlay: HTMLDivElement = h(
    'div',
    { class: 'modal-backdrop', onclick: (ev: Event) => void (ev.target === overlay && close()) },
    h(
      'div',
      { class: 'modal', role: 'dialog' },
      h(
        'div',
        { class: 'modal-head' },
        h('h2', {}, 'Einstellungen'),
        h('button', { class: 'icon-btn', onclick: close }, '×'),
      ),

      h(
        'section',
        { class: 'setting' },
        h('h3', {}, 'Umgebungskarte'),
        h('p', { class: 'setting-note' }, 'Kantenlänge der längeren Bildschirmseite.'),
        h('div', { class: 'range-row' }, radius, radiusValue),
      ),

      h(
        'section',
        { class: 'setting' },
        h('h3', {}, 'Standort'),
        locationStatus,
        h(
          'div',
          { class: 'setting-row' },
          h(
            'button',
            {
              class: 'btn',
              onclick: () => {
                location.useDevice();
                locationStatus.textContent = locationText();
              },
            },
            'Gerätestandort verwenden',
          ),
        ),
        h('p', { class: 'setting-note' }, 'Oder von Hand setzen — praktisch ohne Empfang und zum Ausprobieren:'),
        h('div', { class: 'setting-row' }, cityInput, h('button', { class: 'btn', onclick: setManual }, 'Setzen')),
        cityList,
      ),

      h(
        'section',
        { class: 'setting' },
        h('h3', {}, 'Punkte'),
        h(
          'p',
          { class: 'setting-note' },
          `Ein Punkt je ${KM_PER_POINT} km Luftlinie zwischen deinem Standort und der Heimatstadt des Kennzeichens. ` +
            'Punkte gelten pro Fahrt; jedes Kennzeichen zählt innerhalb einer Fahrt einmal. ' +
            'Erstfunde bekommen einen Moment, aber keinen Bonus.',
        ),
      ),

      h(
        'section',
        { class: 'setting' },
        h('h3', {}, 'Daten'),
        h(
          'p',
          { class: 'setting-note' },
          `${Object.keys(store.state.collection).length} von ${PLATES.length} Kennzeichen gesammelt. ` +
            'Alles liegt nur auf diesem Gerät.',
        ),
        h(
          'button',
          {
            class: 'btn btn-danger',
            onclick: () => {
              if (confirm('Fahrt, Sammlung und Achievements unwiderruflich löschen?')) {
                store.resetAll();
                toast('Alles zurückgesetzt.');
                close();
              }
            },
          },
          'Alles zurücksetzen',
        ),
      ),
    ),
  );

  parent.append(overlay);
  requestAnimationFrame(() => overlay.classList.add('is-open'));
}

function locationText(): string {
  const state = location.current;
  switch (state.status) {
    case 'ok':
      return `Aktiv, Genauigkeit ±${Math.round(state.accuracyM ?? 0)} m.`;
    case 'manuell':
      return 'Von Hand gesetzt. Das Gerät wird nicht abgefragt.';
    case 'verweigert':
      return 'Die Standortfreigabe wurde abgelehnt. Sie lässt sich in den Browsereinstellungen wieder erlauben.';
    case 'suchen':
      return 'Wird gesucht …';
    default:
      return state.message ?? 'Noch kein Standort.';
  }
}
