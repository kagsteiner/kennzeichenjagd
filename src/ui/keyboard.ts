/**
 * Mitdenkende Kennzeichen-Tastatur.
 *
 * Nach jedem Buchstaben bleiben nur die Tasten aktiv, die noch zu einem
 * existierenden Kennzeichen führen — Fehleingaben sind damit ausgeschlossen.
 * Steht ein Kennzeichen eindeutig fest (kein weiterer Buchstabe möglich),
 * wird sofort abgeschickt und die Tastatur verschwindet.
 */

import { ALPHABET, exactPlate, nextLetters, plateByCode } from '../game/plates';

const ROW_LENGTH = 7;

export interface KeyboardOptions {
  onSubmit: (code: string) => void;
  onOpenChange?: (open: boolean) => void;
}

export class PlateKeyboard {
  readonly root: HTMLDivElement;
  private input = '';
  private open = false;
  private keys = new Map<string, HTMLButtonElement>();
  private display: HTMLDivElement;
  private hint: HTMLDivElement;
  private confirm: HTMLButtonElement;
  private back: HTMLButtonElement;

  constructor(private opts: KeyboardOptions) {
    this.root = document.createElement('div');
    this.root.className = 'keyboard';
    this.root.hidden = true;

    const head = document.createElement('div');
    head.className = 'keyboard-head';
    this.display = document.createElement('div');
    this.display.className = 'keyboard-display';
    this.hint = document.createElement('div');
    this.hint.className = 'keyboard-hint';
    head.append(this.display, this.hint);

    const grid = document.createElement('div');
    grid.className = 'keyboard-grid';
    grid.style.setProperty('--cols', String(ROW_LENGTH));
    for (const letter of ALPHABET) {
      const key = document.createElement('button');
      key.type = 'button';
      key.className = 'key';
      key.textContent = letter;
      key.addEventListener('click', () => this.press(letter));
      grid.append(key);
      this.keys.set(letter, key);
    }

    const actions = document.createElement('div');
    actions.className = 'keyboard-actions';
    this.back = document.createElement('button');
    this.back.type = 'button';
    this.back.className = 'key key-wide key-back';
    this.back.textContent = '⌫';
    this.back.addEventListener('click', () => this.backspace());

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'key key-wide key-close';
    close.textContent = 'Abbrechen';
    close.addEventListener('click', () => this.hide());

    this.confirm = document.createElement('button');
    this.confirm.type = 'button';
    this.confirm.className = 'key key-wide key-confirm';
    this.confirm.textContent = 'Gefunden';
    this.confirm.addEventListener('click', () => this.submit());

    actions.append(close, this.back, this.confirm);
    this.root.append(head, grid, actions);
    this.update();

    document.addEventListener('keydown', this.onPhysicalKey);
  }

  destroy(): void {
    document.removeEventListener('keydown', this.onPhysicalKey);
  }

  /** Hardware-Tastatur — praktisch am Rechner, stört auf dem Handy nicht. */
  private onPhysicalKey = (ev: KeyboardEvent): void => {
    if (!this.open) return;
    if (ev.key === 'Escape') return this.hide();
    if (ev.key === 'Backspace') {
      ev.preventDefault();
      return this.backspace();
    }
    if (ev.key === 'Enter') {
      ev.preventDefault();
      return this.submit();
    }
    const letter = ev.key.toUpperCase();
    if (this.keys.has(letter) && !this.keys.get(letter)!.disabled) {
      ev.preventDefault();
      this.press(letter);
    }
  };

  get isOpen(): boolean {
    return this.open;
  }

  show(): void {
    if (this.open) return;
    this.input = '';
    this.open = true;
    this.root.hidden = false;
    // Erst nach dem Einblenden animieren, sonst greift die Transition nicht.
    requestAnimationFrame(() => this.root.classList.add('is-open'));
    this.update();
    this.opts.onOpenChange?.(true);
  }

  hide(): void {
    if (!this.open) return;
    this.open = false;
    this.root.classList.remove('is-open');
    this.input = '';
    this.update();
    const done = () => {
      if (!this.open) this.root.hidden = true;
    };
    setTimeout(done, 200);
    this.opts.onOpenChange?.(false);
  }

  private press(letter: string): void {
    const next = this.input + letter;
    if (!exactPlate(next) && nextLetters(next).size === 0) return;
    this.input = next;

    // Eindeutig: kein weiterer Buchstabe führt noch irgendwohin.
    if (exactPlate(next) && nextLetters(next).size === 0) {
      this.submit();
      return;
    }
    this.update();
  }

  private backspace(): void {
    if (!this.input) return this.hide();
    this.input = this.input.slice(0, -1);
    this.update();
  }

  private submit(): void {
    const code = this.input;
    if (!exactPlate(code)) return;
    this.hide();
    this.opts.onSubmit(code);
  }

  private update(): void {
    const allowed = nextLetters(this.input);
    for (const [letter, key] of this.keys) key.disabled = !allowed.has(letter);

    this.display.textContent = this.input || '––';
    this.display.classList.toggle('is-empty', !this.input);

    const plate = this.input ? plateByCode(this.input) : undefined;
    const options = allowed.size;
    this.hint.textContent = plate
      ? `${plate.city} · ${plate.mnemonic}`
      : this.input
        ? `${options} Möglichkeit${options === 1 ? '' : 'en'}`
        : 'Kennzeichen eintippen';

    this.confirm.disabled = !plate;
    this.back.disabled = false;
    this.root.classList.toggle('has-plate', Boolean(plate));
  }
}
