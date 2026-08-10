/**
 * Der Fahrt-Bildschirm: Umgebungskarte, Punktestand, Eingabe.
 *
 * Die Karte ist ständig sichtbar. Die Kennzeichen-Tastatur kommt nur über den
 * Knopf im Dock; ein Tipp auf ein Fähnchen zeigt stattdessen dessen Karte mit
 * der Entfernung.
 */

import { distanceKm, compass, type LatLon } from '../game/geo';
import { location } from '../game/location';
import { nearby, plateByCode, type Plate } from '../game/plates';
import { pointsFor, findTier, KM_PER_POINT } from '../game/scoring';
import { store, tripPoints, type Find } from '../game/store';
import { describe, newlyEarned } from '../game/achievements';
import { MapView, type Marker, type View } from './map';
import { PlateKeyboard } from './keyboard';
import { formatClock, formatKm, h, wait } from './dom';
import { toast } from './toast';
import { openSettings } from './settings';

const HINT_LIMIT = 60;

/** Fund-Moment: 0,5 s herauszoomen, 2 s Standbild, 0,5 s zurück. */
const ZOOM_MS = 500;
const HOLD_MS = 2000;

export class DriveScreen {
  readonly root: HTMLElement;
  private map: MapView;
  private keyboard: PlateKeyboard;
  private mapHost: HTMLElement;
  private scoreEl: HTMLElement;
  private metaEl: HTMLElement;
  private statusEl: HTMLElement;
  private recenterEl: HTMLElement;
  private overlay: HTMLElement;
  private sheet: HTMLElement;
  private sheetList: HTMLElement;

  private findGeneration = 0;
  private celebrating = false;
  private placeCode: string | null = null;
  /** Der Ausschnitt wurde von Hand gewählt — dann führt die Karte nicht mehr nach. */
  private manualView = false;
  private mounted = true;
  private unsubscribe: Array<() => void> = [];

  constructor(private onBack: () => void, private onCollection: () => void) {
    this.mapHost = h('div', { class: 'map-host' });
    this.map = new MapView(this.mapHost);
    this.map.gestures = true;
    this.map.onMarkerClick = (code) => this.showPlaceCard(code);
    this.map.onUserView = () => this.enterManualView();
    // Daneben getippt: die Ortskarte wieder weg.
    this.mapHost.addEventListener('click', () => this.hidePlaceCard());

    this.scoreEl = h('strong', { class: 'score-value' }, '0');
    this.metaEl = h('div', { class: 'hud-meta' }, '');
    this.statusEl = h('button', { class: 'status-chip', onclick: () => this.openSettings() }, 'Standort …');
    this.overlay = h('div', { class: 'find-overlay', 'aria-live': 'polite' });

    const hud = h(
      'header',
      { class: 'hud' },
      h('button', { class: 'icon-btn', title: 'Zurück', onclick: () => this.onBack() }, '‹'),
      h(
        'div',
        { class: 'hud-center' },
        h('div', { class: 'score' }, this.scoreEl, h('span', { class: 'score-unit' }, 'Punkte')),
        this.metaEl,
      ),
      h('button', { class: 'icon-btn', title: 'Einstellungen', onclick: () => this.openSettings() }, '⚙'),
    );

    this.sheetList = h('div', { class: 'nearby-list' });
    this.sheet = h(
      'div',
      { class: 'sheet' },
      h(
        'div',
        { class: 'sheet-head' },
        h('h2', {}, 'In der Nähe'),
        h('button', { class: 'icon-btn', onclick: () => this.toggleSheet(false) }, '×'),
      ),
      h('p', { class: 'sheet-note' }, `Nächstgelegene Kennzeichen. 1 Punkt je ${KM_PER_POINT} km Entfernung.`),
      this.sheetList,
    );
    this.sheet.hidden = true;

    this.keyboard = new PlateKeyboard({
      onSubmit: (code) => void this.registerFind(code),
      onOpenChange: (open) => {
        this.root.classList.toggle('keyboard-open', open);
        if (open) this.hidePlaceCard();
      },
    });

    this.recenterEl = h(
      'button',
      { class: 'recenter-btn', title: 'Zurück zur Umgebung', onclick: () => this.recenter() },
      '◎ Umgebung',
    );
    this.recenterEl.hidden = true;

    const dock = h(
      'footer',
      { class: 'dock' },
      h('button', { class: 'btn btn-primary', onclick: () => this.keyboard.show() }, 'Kennzeichen eintippen'),
      h('button', { class: 'btn', onclick: () => this.toggleSheet(true) }, 'In der Nähe'),
      h('button', { class: 'btn', onclick: () => this.onCollection() }, 'Sammlung'),
    );

    this.root = h(
      'div',
      { class: 'screen screen-drive' },
      this.mapHost,
      hud,
      h('div', { class: 'status-row' }, this.statusEl, this.recenterEl),
      this.overlay,
      this.sheet,
      dock,
      this.keyboard.root,
    );

    this.unsubscribe.push(store.subscribe(() => this.refresh()));
    this.unsubscribe.push(location.subscribe(() => this.onLocation()));
    location.start();
    this.refresh();
  }

  destroy(): void {
    this.mounted = false;
    this.findGeneration++;
    this.keyboard.destroy();
    for (const off of this.unsubscribe) off();
    location.stop();
  }

  /* ---------- Ansicht ---------- */

  private localView(): View {
    const pos = location.current.position;
    if (!pos) return this.map.germanyView();
    return { center: pos, spanKm: store.state.settings.radiusKm };
  }

  private onLocation(): void {
    const state = location.current;
    this.map.setHome(state.position, this.ringsKm());
    const labels: Record<string, string> = {
      idle: 'Standort …',
      suchen: 'Standort wird gesucht …',
      ok: state.accuracyM ? `Standort ±${Math.round(state.accuracyM)} m` : 'Standort aktiv',
      manuell: 'Standort von Hand gesetzt',
      verweigert: 'Kein Standort — hier tippen',
      fehler: 'Kein Standort — hier tippen',
    };
    this.statusEl.textContent = labels[state.status] ?? '';
    this.statusEl.dataset.status = state.status;
    this.refresh();
  }

  /**
   * Sobald jemand die Karte selbst schiebt oder zoomt, hört das automatische
   * Nachführen auf — sonst risse es den Ausschnitt bei der nächsten
   * Standortmeldung wieder weg. Der Knopf holt die Umgebung zurück.
   */
  private enterManualView(): void {
    // Wer mitten im Fund-Moment zur Karte greift, will sie selbst führen:
    // die Zoomfahrt ist damit beendet, nicht bloß angehalten.
    if (this.celebrating) this.endCelebration();
    if (this.manualView) return;
    this.manualView = true;
    this.recenterEl.hidden = false;
  }

  private endCelebration(): void {
    this.findGeneration++;
    this.celebrating = false;
    this.hideFindCard();
    this.map.clearLink();
    this.map.highlightMarker('');
  }

  private recenter(): void {
    this.manualView = false;
    this.recenterEl.hidden = true;
    if (!this.celebrating) void this.map.animateTo(this.localView(), 420);
  }

  /** Karte, Marker und Anzeigen an den aktuellen Stand angleichen. */
  private refresh(): void {
    if (!this.mounted) return;
    const trip = store.state.trip;
    const pos = location.current.position;

    this.scoreEl.textContent = String(tripPoints(trip));
    const count = trip?.finds.length ?? 0;
    this.metaEl.textContent = trip
      ? `${count} ${count === 1 ? 'Fund' : 'Funde'} · seit ${formatClock(trip.startedAt)}`
      : 'Noch keine Fahrt';

    this.map.setMarkers(this.markers());
    if (!this.celebrating && !this.manualView) this.map.setView(this.localView());
    if (!this.sheet.hidden) this.fillSheet();
    if (pos) this.map.setHome(pos, this.ringsKm());
  }

  /**
   * Drei Entfernungsringe als Maßstab, abgeleitet aus dem eingestellten Radius
   * und auf runde Werte gebracht.
   */
  private ringsKm(): number[] {
    const nice = [5, 10, 15, 20, 25, 50, 75, 100, 150, 200, 300];
    const half = store.state.settings.radiusKm / 2;
    const snap = (x: number) => nice.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
    return [...new Set([half / 4, half / 2, half].map(snap))].sort((a, b) => a - b);
  }

  private markers(): Marker[] {
    const trip = store.state.trip;
    const found = new Set(trip?.finds.map((f) => f.code) ?? []);
    const markers: Marker[] = [];

    for (const find of trip?.finds ?? []) {
      const plate = plateByCode(find.code);
      if (plate) markers.push({ code: plate.code, lat: plate.lat, lon: plate.lon, kind: 'trip' });
    }

    // Umliegende Orte als blasse Punkte: sie geben der Umgebungskarte den
    // geografischen Kontext, der einem reinen Kartenausschnitt sonst fehlt.
    const pos = location.current.position;
    if (pos) {
      const radius = store.state.settings.radiusKm * 0.75;
      for (const entry of nearby(pos, HINT_LIMIT, found)) {
        if (entry.km > radius) break;
        markers.push({ code: entry.plate.code, lat: entry.plate.lat, lon: entry.plate.lon, kind: 'hint' });
      }
    }
    return markers;
  }

  /* ---------- Fund ---------- */

  private async registerFind(code: string): Promise<void> {
    const plate = plateByCode(code);
    if (!plate) return;

    const pos = location.current.position;
    if (!pos) {
      toast('Ohne Standort gibt es keine Punkte. Standort freigeben oder von Hand setzen.');
      this.openSettings();
      return;
    }

    const trip = store.state.trip ?? store.startTrip();
    if (trip.finds.some((f) => f.code === code)) {
      toast(`${plate.city} wurde in dieser Fahrt schon gefunden.`);
      return;
    }

    const km = distanceKm(pos, plate);
    const find = store.addFind(code, km, pointsFor(km), pos);
    if (!find) return;

    const fresh = newlyEarned(store.state);
    store.unlockAchievements(fresh);

    await this.celebrate(find, plate, pos, fresh);
  }

  /**
   * Der Fund-Moment: heraus auf ganz Deutschland, Verbindungslinie und Punkte
   * zeigen, wieder zurück in die Umgebung. Rund 2 Sekunden — und jederzeit
   * abbrechbar, wenn schon der nächste Fund ansteht.
   */
  private async celebrate(find: Find, plate: Plate, from: LatLon, achievements: string[]): Promise<void> {
    const generation = ++this.findGeneration;
    const alive = () => this.mounted && generation === this.findGeneration;

    // Ein Fund führt die Karte wieder selbst — ein von Hand gewählter
    // Ausschnitt gilt danach nicht mehr.
    this.manualView = false;
    this.recenterEl.hidden = true;

    this.celebrating = true;
    this.map.setMarkers(this.markers());
    this.map.highlightMarker(plate.code);
    this.map.showLink(from, plate);
    this.showFindCard(find, plate, from);

    if (!(await this.map.animateTo(this.map.germanyView(), ZOOM_MS)) || !alive()) return;
    await wait(HOLD_MS);
    if (!alive()) return;

    this.hideFindCard();
    const returned = await this.map.animateTo(this.localView(), ZOOM_MS);
    if (!alive()) return;

    this.celebrating = false;
    if (returned) this.map.clearLink();
    this.map.highlightMarker('');

    for (const [i, id] of achievements.entries()) {
      const a = describe(id);
      setTimeout(() => toast(`${a.icon}  ${a.description}`, 'achievement', 3400), i * 600);
    }
  }

  /* ---------- Ortskarte (Tipp auf ein Fähnchen) ---------- */

  /**
   * Zeigt zu einem angetippten Marker dieselbe Karte wie beim Fund — nur steht
   * statt der Punktzahl die Entfernung, denn hier ist nichts zu gewinnen.
   */
  private showPlaceCard(code: string): void {
    if (this.celebrating) return;
    if (this.placeCode === code) {
      this.hidePlaceCard();
      return;
    }
    const plate = plateByCode(code);
    if (!plate) return;

    const pos = location.current.position;
    const km = pos ? distanceKm(pos, plate) : null;
    const direction = pos ? compass(pos, plate) : '';
    const known = store.state.trip?.finds.some((f) => f.code === code) ?? false;

    const card = h(
      'div',
      {
        class: `find-card place-card${km === null ? '' : ` tier-${findTier(km)}`}`,
        onclick: (ev: Event) => ev.stopPropagation(),
      },
      known ? h('div', { class: 'find-new found' }, 'Schon gefunden') : null,
      h('div', { class: 'find-code' }, plate.code),
      h('div', { class: 'find-mnemonic' }, plate.mnemonic),
      h('div', { class: 'find-city' }, plate.city),
      h(
        'div',
        { class: 'find-distance' },
        km === null ? 'Ohne Standort keine Entfernung' : direction ? `Richtung ${direction}` : 'ganz in der Nähe',
      ),
      km === null ? null : h('div', { class: 'find-points' }, formatKm(km)),
    );

    this.overlay.classList.remove('at-top');
    this.overlay.classList.add('is-interactive');
    this.overlay.replaceChildren(card);
    this.placeCode = code;
    requestAnimationFrame(() => card.classList.add('is-in'));
  }

  private hidePlaceCard(): void {
    if (!this.placeCode) return;
    this.placeCode = null;
    this.overlay.classList.remove('is-interactive');
    this.hideFindCard();
  }

  private showFindCard(find: Find, plate: Plate, from: LatLon): void {
    this.placeCode = null;
    this.overlay.classList.remove('is-interactive');

    const card = h(
      'div',
      { class: `find-card tier-${findTier(find.km)}` },
      find.firstEver ? h('div', { class: 'find-new' }, 'Neu entdeckt!') : null,
      h('div', { class: 'find-code' }, plate.code),
      h('div', { class: 'find-mnemonic' }, plate.mnemonic),
      h('div', { class: 'find-city' }, plate.city),
      h('div', { class: 'find-distance' }, `${formatKm(find.km)} ${compass(from, plate)}`.trim()),
      h('div', { class: 'find-points' }, `+${find.points}`),
    );
    // Die Karte weicht dem Fundort aus: liegt er im Norden, sitzt sie unten
    // und umgekehrt. Der neue Ort ist die Information des Moments.
    this.overlay.classList.toggle('at-top', plate.lat < 51.16);
    this.overlay.replaceChildren(card);
    requestAnimationFrame(() => card.classList.add('is-in'));
  }

  private hideFindCard(): void {
    const card = this.overlay.firstElementChild;
    if (!card) return;
    card.classList.remove('is-in');
    setTimeout(() => card.remove(), 320);
  }

  /* ---------- Nähe-Liste ---------- */

  private toggleSheet(open: boolean): void {
    this.sheet.hidden = !open;
    if (open) {
      this.keyboard.hide();
      this.hidePlaceCard();
      this.fillSheet();
      requestAnimationFrame(() => this.sheet.classList.add('is-open'));
    } else {
      this.sheet.classList.remove('is-open');
    }
  }

  private fillSheet(): void {
    const pos = location.current.position;
    if (!pos) {
      this.sheetList.replaceChildren(
        h('p', { class: 'empty' }, 'Ohne Standort lässt sich die Umgebung nicht bestimmen.'),
      );
      return;
    }
    const found = new Set(store.state.trip?.finds.map((f) => f.code) ?? []);
    const entries = nearby(pos, 30, found);
    this.sheetList.replaceChildren(
      ...entries.map((entry) =>
        h(
          'button',
          { class: 'nearby-item', onclick: () => this.pickFromSheet(entry.plate.code) },
          h('span', { class: 'nearby-code' }, entry.plate.code),
          h(
            'span',
            { class: 'nearby-text' },
            h('span', { class: 'nearby-city' }, entry.plate.city),
            h('span', { class: 'nearby-km' }, `${formatKm(entry.km)} ${compass(pos, entry.plate)}`.trim()),
          ),
          h('span', { class: 'nearby-points' }, `+${pointsFor(entry.km)}`),
        ),
      ),
    );
  }

  private pickFromSheet(code: string): void {
    this.toggleSheet(false);
    void this.registerFind(code);
  }

  private openSettings(): void {
    this.keyboard.hide();
    openSettings(this.root);
  }
}
