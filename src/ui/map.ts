/**
 * Schematische Deutschlandkarte als SVG.
 *
 * Alles rechnet in projizierten Kilometern (siehe geo.ts). Eine Ansicht ist
 * damit schlicht "Mittelpunkt + Kantenlänge der längeren Seite in km" — die
 * Umgebungskarte ist eine 100-km-Ansicht, die Gesamtansicht eine ~900-km-Ansicht.
 *
 * Marker werden gegen den Zoom skaliert, damit sie auf jeder Stufe gleich groß
 * erscheinen. Zoomfahrten laufen über requestAnimationFrame und sind jederzeit
 * abbrechbar — beim nächsten Fund darf die alte Animation nicht nachhängen.
 */

import { project, unproject, type LatLon, type Point } from '../game/geo';
import { STATES } from '../game/plates';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface View {
  center: LatLon;
  spanKm: number;
}

export type MarkerKind = 'trip' | 'life' | 'hint';

export interface Marker {
  code: string;
  lat: number;
  lon: number;
  kind: MarkerKind;
}

interface PlacedMarker {
  el: SVGGElement;
  p: Point;
}

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Umschließendes Rechteck aller Bundesländer, in projizierten Kilometern. */
const GERMANY_BOUNDS = (() => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const state of STATES) {
    for (const ring of state.rings) {
      for (const [lon, lat] of ring) {
        const p = project({ lat, lon });
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
    }
  }
  return {
    center: unproject({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 }),
    widthKm: maxX - minX,
    heightKm: maxY - minY,
  };
})();

export class MapView {
  readonly svg: SVGSVGElement;
  private gWorld: SVGGElement;
  private gStates: SVGGElement;
  private gLinks: SVGGElement;
  private gMarkers: SVGGElement;
  private gRings: SVGGElement;
  private gHome: SVGGElement;

  /** Hält die Ansicht auf der Gesamtkarte, auch wenn sich die Fenstergröße ändert. */
  autoFit = false;

  /** Wird gerufen, wenn auf ein Fähnchen (oder einen Ortspunkt) getippt wird. */
  onMarkerClick: ((code: string) => void) | null = null;

  private view: View = { center: GERMANY_BOUNDS.center, spanKm: 900 };
  private size = { w: 1, h: 1 };
  private placed: PlacedMarker[] = [];
  private ringLabels: { el: SVGTextElement; p: Point }[] = [];
  private homePoint: Point | null = null;
  private animation: number | null = null;
  private cancelCurrent: (() => void) | null = null;

  constructor(private container: HTMLElement) {
    this.svg = el('svg', { class: 'map', preserveAspectRatio: 'xMidYMid meet' });
    this.gWorld = el('g', { class: 'world' });
    this.gStates = el('g', { class: 'layer-states' });
    this.gLinks = el('g', { class: 'layer-links' });
    this.gMarkers = el('g', { class: 'layer-markers' });
    this.gRings = el('g', { class: 'layer-rings' });
    this.gHome = el('g', { class: 'layer-home' });
    this.gWorld.append(this.gStates, this.gRings, this.gLinks, this.gMarkers, this.gHome);
    this.svg.append(this.gWorld);
    container.append(this.svg);

    this.drawStates();

    // Tippen auf einen Marker: die Trefferfläche liegt im Marker selbst, der
    // Rest der Karte bleibt für Gesten frei.
    this.gMarkers.addEventListener('click', (ev) => {
      const marker = (ev.target as Element | null)?.closest<SVGGElement>('.marker');
      const code = marker?.dataset.code;
      if (!code) return;
      ev.stopPropagation();
      this.onMarkerClick?.(code);
    });

    const ro = new ResizeObserver(() => this.measure());
    ro.observe(container);
    this.measure();
  }

  /* ---------- Grundriss ---------- */

  private drawStates(): void {
    for (const state of STATES) {
      const d = state.rings
        .map(
          (ring) =>
            ring
              .map(([lon, lat], i) => {
                const p = project({ lat, lon });
                return `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
              })
              .join('') + 'Z',
        )
        .join('');
      const path = el('path', { d, class: 'state', 'data-state': state.id });
      const title = el('title');
      title.textContent = state.name;
      path.append(title);
      this.gStates.append(path);
    }
  }

  /** Bundesländer einfärben, in denen schon etwas gesammelt wurde. */
  setStateProgress(found: ReadonlySet<string>): void {
    for (const path of this.gStates.querySelectorAll<SVGPathElement>('path.state')) {
      path.classList.toggle('is-found', found.has(path.dataset.state ?? ''));
    }
  }

  /* ---------- Ansicht ---------- */

  private measure(): void {
    const rect = this.container.getBoundingClientRect();
    this.size = { w: Math.max(1, rect.width), h: Math.max(1, rect.height) };
    if (this.autoFit) this.view = this.germanyView();
    this.applyView();
  }

  /**
   * Gesamtansicht: ganz Deutschland passend zum aktuellen Seitenverhältnis.
   * Anders als die Umgebungskarte, wo die Kantenlänge fest vorgegeben ist,
   * muss hier alles ins Bild — im Hochformat also über die Breite gerechnet.
   */
  germanyView(): View {
    const { w, h } = this.size;
    const { widthKm, heightKm } = GERMANY_BOUNDS;
    const pad = 1.06;
    const span =
      w >= h
        ? Math.max(widthKm, heightKm * (w / h))
        : Math.max(heightKm, widthKm * (h / w));
    return { center: GERMANY_BOUNDS.center, spanKm: span * pad };
  }

  private applyView(): void {
    const { w, h } = this.size;
    const span = this.view.spanKm;
    const vbW = w >= h ? span : span * (w / h);
    const vbH = w >= h ? span * (h / w) : span;
    const c = project(this.view.center);
    this.svg.setAttribute(
      'viewBox',
      `${(c.x - vbW / 2).toFixed(2)} ${(c.y - vbH / 2).toFixed(2)} ${vbW.toFixed(2)} ${vbH.toFixed(2)}`,
    );

    // Kilometer pro Bildschirmpixel — Marker rechnen darüber ihre Gegenskalierung.
    const kmPerPx = vbW / w;
    this.svg.style.setProperty('--km-per-px', String(kmPerPx));
    this.svg.dataset.zoom = span > 400 ? 'weit' : span > 180 ? 'mittel' : 'nah';
    this.rescale(kmPerPx);
  }

  private rescale(kmPerPx: number): void {
    const s = kmPerPx.toFixed(4);
    for (const m of this.placed) {
      m.el.setAttribute('transform', `translate(${m.p.x.toFixed(1)} ${m.p.y.toFixed(1)}) scale(${s})`);
    }
    for (const label of this.ringLabels) {
      label.el.setAttribute(
        'transform',
        `translate(${label.p.x.toFixed(1)} ${label.p.y.toFixed(1)}) scale(${s})`,
      );
    }
    if (this.homePoint) {
      this.gHome.setAttribute(
        'transform',
        `translate(${this.homePoint.x.toFixed(1)} ${this.homePoint.y.toFixed(1)}) scale(${s})`,
      );
    }
    this.gLinks.style.setProperty('stroke-width', String(kmPerPx * 2.5));
  }

  get currentView(): View {
    return this.view;
  }

  /** Bricht eine laufende Zoomfahrt ab. Das angehaltene Bild bleibt stehen. */
  stopAnimation(): void {
    if (this.animation !== null) cancelAnimationFrame(this.animation);
    this.animation = null;
    this.cancelCurrent?.();
    this.cancelCurrent = null;
  }

  setView(view: View): void {
    this.stopAnimation();
    this.view = view;
    this.applyView();
  }

  /**
   * Weiche Fahrt zur Zielansicht. Das Promise erfüllt mit `false`, wenn
   * unterwegs abgebrochen wurde.
   */
  animateTo(target: View, durationMs: number): Promise<boolean> {
    this.stopAnimation();
    const from = this.view;
    const fromP = project(from.center);
    const toP = project(target.center);
    const logFrom = Math.log(from.spanKm);
    const logTo = Math.log(target.spanKm);
    const start = performance.now();

    return new Promise<boolean>((resolve) => {
      this.cancelCurrent = () => resolve(false);
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / durationMs);
        const k = easeInOutCubic(t);
        this.view = {
          center: unproject({
            x: fromP.x + (toP.x - fromP.x) * k,
            y: fromP.y + (toP.y - fromP.y) * k,
          }),
          spanKm: Math.exp(logFrom + (logTo - logFrom) * k),
        };
        this.applyView();
        if (t < 1) {
          this.animation = requestAnimationFrame(step);
        } else {
          this.animation = null;
          this.cancelCurrent = null;
          resolve(true);
        }
      };
      this.animation = requestAnimationFrame(step);
    });
  }

  /* ---------- Marker ---------- */

  setMarkers(markers: Marker[]): void {
    this.gMarkers.replaceChildren();
    this.placed = [];
    for (const m of markers) {
      const g = el('g', { class: `marker marker-${m.kind}`, 'data-code': m.code });
      if (m.kind === 'hint') {
        g.append(el('circle', { r: 3.2, class: 'dot' }));
      } else {
        // Fähnchen: Mast plus Tuch, Fußpunkt exakt auf dem Ort.
        g.append(el('circle', { r: 2.6, class: 'foot' }));
        g.append(el('path', { d: 'M0 0 V-17', class: 'pole' }));
        g.append(el('path', { d: 'M0 -17 H13 L10 -12.5 L13 -8 H0 Z', class: 'cloth' }));
      }
      const label = el('text', {
        class: 'marker-label',
        x: m.kind === 'hint' ? 0 : 15,
        y: m.kind === 'hint' ? 12 : -8,
        'text-anchor': m.kind === 'hint' ? 'middle' : 'start',
      });
      label.textContent = m.code;
      g.append(label);
      // Unsichtbare Trefferfläche — sie skaliert mit dem Marker und ist damit
      // auf jeder Zoomstufe gleich groß (gut mit dem Daumen zu treffen).
      g.append(
        m.kind === 'hint'
          ? el('circle', { r: 11, class: 'marker-hit' })
          : el('rect', { x: -11, y: -22, width: 33, height: 30, class: 'marker-hit' }),
      );
      this.gMarkers.append(g);
      this.placed.push({ el: g, p: project(m) });
    }
    this.applyView();
  }

  /** Hebt einen bereits gesetzten Marker hervor (frischer Fund). */
  highlightMarker(code: string): void {
    for (const node of this.gMarkers.querySelectorAll<SVGGElement>('.marker')) {
      node.classList.toggle('is-fresh', node.dataset.code === code);
    }
  }

  /**
   * Eigener Standort, dazu Entfernungsringe. Die Ringe sind der Maßstab der
   * Umgebungskarte: ohne sie lässt sich auf einer schematischen Karte kaum
   * abschätzen, wie weit ein Ort wirklich weg ist.
   */
  setHome(position: LatLon | null, ringsKm: number[] = []): void {
    this.gHome.replaceChildren();
    this.gRings.replaceChildren();
    this.ringLabels = [];
    this.homePoint = position ? project(position) : null;
    if (!position || !this.homePoint) return;

    for (const km of ringsKm) {
      this.gRings.append(
        el('circle', {
          cx: this.homePoint.x.toFixed(1),
          cy: this.homePoint.y.toFixed(1),
          r: km,
          class: 'range-ring',
        }),
      );
      const label = el('text', { class: 'range-label' });
      label.textContent = `${km} km`;
      this.gRings.append(label);
      this.ringLabels.push({ el: label, p: { x: this.homePoint.x, y: this.homePoint.y - km } });
    }

    this.gHome.append(el('circle', { r: 16, class: 'home-pulse' }));
    this.gHome.append(el('circle', { r: 7, class: 'home-halo' }));
    this.gHome.append(el('circle', { r: 4, class: 'home-dot' }));
    this.applyView();
  }

  /* ---------- Verbindungslinie des Fund-Moments ---------- */

  showLink(from: LatLon, to: LatLon): void {
    this.gLinks.replaceChildren();
    const a = project(from);
    const b = project(to);
    // Leichter Bogen, damit die Linie nicht wie ein Lineal wirkt.
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const nx = -(b.y - a.y);
    const ny = b.x - a.x;
    const len = Math.hypot(nx, ny) || 1;
    const bow = Math.min(90, Math.hypot(b.x - a.x, b.y - a.y) * 0.16);
    const cx = mx + (nx / len) * bow;
    const cy = my + (ny / len) * bow;

    const path = el('path', {
      d: `M${a.x.toFixed(1)} ${a.y.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`,
      class: 'link',
    });
    this.gLinks.append(path);
    const length = path.getTotalLength();
    path.style.strokeDasharray = String(length);
    path.style.strokeDashoffset = String(length);
    path.getBoundingClientRect(); // Layout erzwingen, sonst springt die Animation
    path.style.transition = 'stroke-dashoffset 700ms cubic-bezier(.3,.7,.4,1)';
    path.style.strokeDashoffset = '0';
    this.applyView();
  }

  clearLink(): void {
    this.gLinks.replaceChildren();
  }
}
