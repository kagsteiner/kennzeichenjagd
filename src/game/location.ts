/**
 * Standort über die Geolocation-API, getaktet weitergegeben.
 *
 * Die Rohposition kommt im Auto im Sekundentakt. Für die Nähe-Liste reicht ein
 * Update alle paar Sekunden oder nach ein paar hundert Metern — das spart Akku,
 * ohne dass es sich träge anfühlt (siehe Design, 3.).
 */

import { distanceKm, type LatLon } from './geo';
import { store } from './store';

const MIN_INTERVAL_MS = 4000;
const MIN_MOVE_KM = 0.3;

export type LocationStatus = 'idle' | 'suchen' | 'ok' | 'verweigert' | 'fehler' | 'manuell';

export interface LocationState {
  position: LatLon | null;
  accuracyM: number | null;
  status: LocationStatus;
  message?: string;
}

type Listener = (state: LocationState) => void;

class LocationService {
  private state: LocationState = { position: null, accuracyM: null, status: 'idle' };
  private listeners = new Set<Listener>();
  private watchId: number | null = null;
  private lastEmit = 0;
  private lastPos: LatLon | null = null;

  get current(): LocationState {
    return this.state;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private emit(patch: Partial<LocationState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }

  start(): void {
    if (this.watchId !== null) return;

    // Ein gespeicherter Handstandort hat Vorrang; das Gerät wird dann gar
    // nicht erst gefragt.
    const saved = store.state.settings.manualPosition;
    if (saved) {
      this.lastPos = saved;
      this.emit({ position: saved, accuracyM: null, status: 'manuell' });
      return;
    }

    if (!('geolocation' in navigator)) {
      this.emit({ status: 'fehler', message: 'Dieses Gerät kennt keine Standortbestimmung.' });
      return;
    }
    this.emit({ status: this.state.status === 'manuell' ? 'manuell' : 'suchen' });
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.onPosition(pos),
      (err) => this.onError(err),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
  }

  stop(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  private onPosition(pos: GeolocationPosition): void {
    const next: LatLon = { lat: pos.coords.latitude, lon: pos.coords.longitude };
    const now = Date.now();
    const moved = this.lastPos ? distanceKm(this.lastPos, next) : Infinity;
    if (this.lastPos && now - this.lastEmit < MIN_INTERVAL_MS && moved < MIN_MOVE_KM) return;
    this.lastEmit = now;
    this.lastPos = next;
    this.emit({ position: next, accuracyM: pos.coords.accuracy, status: 'ok' });
  }

  private onError(err: GeolocationPositionError): void {
    // Ein manuell gesetzter Standort bleibt gültig, auch wenn das GPS meckert.
    if (this.state.status === 'manuell') return;
    if (err.code === err.PERMISSION_DENIED) {
      this.emit({ status: 'verweigert', message: 'Standortfreigabe abgelehnt.' });
      this.stop();
    } else {
      this.emit({ status: 'fehler', message: 'Standort noch nicht verfügbar.' });
    }
  }

  /** Standort von Hand setzen — für Test, Planung oder abgelehnte Freigabe. */
  setManual(position: LatLon): void {
    this.stop();
    this.lastPos = position;
    store.updateSettings({ manualPosition: position });
    this.emit({ position, accuracyM: null, status: 'manuell' });
  }

  /** Zurück zur echten Ortung. */
  useDevice(): void {
    store.updateSettings({ manualPosition: null });
    this.state = { ...this.state, status: 'idle' };
    this.lastPos = null;
    this.start();
  }
}

export const location = new LocationService();
