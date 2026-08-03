/** Kurze Einblendungen am oberen Rand — Hinweise, Achievements, Doppelfunde. */

import { h } from './dom';

let host: HTMLElement | null = null;

function ensureHost(): HTMLElement {
  if (!host) {
    host = h('div', { class: 'toast-host' });
    document.body.append(host);
  }
  return host;
}

export function toast(text: string, kind: 'info' | 'achievement' = 'info', ms = 2600): void {
  const node = h('div', { class: `toast toast-${kind}` }, text);
  ensureHost().append(node);
  requestAnimationFrame(() => node.classList.add('is-in'));
  setTimeout(() => {
    node.classList.remove('is-in');
    setTimeout(() => node.remove(), 300);
  }, ms);
}
