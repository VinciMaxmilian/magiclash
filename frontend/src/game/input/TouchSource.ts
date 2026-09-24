import type { Action } from './actions';
import type { InputSource } from './InputManager';

/** Buttons on the right side (mirrors the gamepad layout: jump/confirm, heavy/back…). */
const BUTTONS: { id: string; label: string; actions: Action[]; x: number; y: number; size: number }[] = [
  { id: 'jump', label: 'PULAR', actions: ['jump', 'confirm'], x: 92, y: 36, size: 64 },
  { id: 'light', label: 'LEVE', actions: ['light'], x: 162, y: 84, size: 60 },
  { id: 'heavy', label: 'PESADO', actions: ['heavy', 'back'], x: 88, y: 128, size: 60 },
  { id: 'dodge', label: 'ESQUIVA', actions: ['dodge'], x: 20, y: 96, size: 52 },
];

const STICK_RADIUS = 56;
const DEADZONE = 16;

/** True on phones/tablets (coarse pointer). Desktop never shows the overlay. */
export const hasTouch = (): boolean =>
  typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches ?? false) && 'ontouchstart' in window;

/**
 * On-screen controls as an InputSource: a floating stick on the left half of the screen and
 * buttons on the right. Multi-touch (each finger is tracked by pointerId), so moving and
 * attacking at the same time works. Taps shorter than a frame are kept as `pressed`.
 */
export class TouchSource implements InputSource {
  private readonly root: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private readonly base: HTMLDivElement;
  private stickPointer: number | null = null;
  private origin = { x: 0, y: 0 };
  private stickHeld = new Set<Action>();
  private buttonHeld = new Map<number, Action[]>();
  private pressed = new Set<Action>();

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'mc-touch';

    const zone = document.createElement('div');
    zone.className = 'mc-touch-stickzone';
    this.base = document.createElement('div');
    this.base.className = 'mc-touch-stick';
    this.knob = document.createElement('div');
    this.knob.className = 'mc-touch-knob';
    this.base.appendChild(this.knob);
    zone.appendChild(this.base);
    zone.addEventListener('pointerdown', this.onStickDown);
    zone.addEventListener('pointermove', this.onStickMove);
    zone.addEventListener('pointerup', this.onStickUp);
    zone.addEventListener('pointercancel', this.onStickUp);
    this.root.appendChild(zone);

    const pad = document.createElement('div');
    pad.className = 'mc-touch-buttons';
    for (const b of BUTTONS) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `mc-touch-btn mc-touch-${b.id}`;
      el.textContent = b.label;
      Object.assign(el.style, { right: `${b.x}px`, bottom: `${b.y}px`, width: `${b.size}px`, height: `${b.size}px` });
      el.addEventListener('pointerdown', (e) => this.onButtonDown(e, b.actions));
      el.addEventListener('pointerup', this.onButtonUp);
      el.addEventListener('pointercancel', this.onButtonUp);
      pad.appendChild(el);
    }
    const pause = document.createElement('button');
    pause.type = 'button';
    pause.className = 'mc-touch-btn mc-touch-pause';
    pause.textContent = 'II';
    pause.addEventListener('pointerdown', (e) => this.onButtonDown(e, ['pause', 'back']));
    pause.addEventListener('pointerup', this.onButtonUp);
    pause.addEventListener('pointercancel', this.onButtonUp);
    this.root.appendChild(pad);
    this.root.appendChild(pause);
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    parent.appendChild(this.root);
  }

  private onStickDown = (e: PointerEvent) => {
    if (this.stickPointer !== null) return;
    this.stickPointer = e.pointerId;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    // Floating stick: it appears under the thumb, wherever it lands (zone-relative position).
    this.origin = { x: e.clientX, y: e.clientY };
    const zone = (e.currentTarget as HTMLElement).getBoundingClientRect();
    Object.assign(this.base.style, {
      left: `${e.clientX - zone.left - STICK_RADIUS}px`,
      top: `${e.clientY - zone.top - STICK_RADIUS}px`,
      bottom: 'auto',
      opacity: '1',
    });
    this.knob.style.transform = 'translate(0px, 0px)';
    e.preventDefault();
  };

  private onStickMove = (e: PointerEvent) => {
    if (e.pointerId !== this.stickPointer) return;
    let dx = e.clientX - this.origin.x;
    let dy = e.clientY - this.origin.y;
    const d = Math.hypot(dx, dy);
    if (d > STICK_RADIUS) {
      dx = (dx / d) * STICK_RADIUS;
      dy = (dy / d) * STICK_RADIUS;
    }
    this.knob.style.transform = `translate(${Math.round(dx)}px, ${Math.round(dy)}px)`;
    this.setStick(dx, dy);
  };

  private onStickUp = (e: PointerEvent) => {
    if (e.pointerId !== this.stickPointer) return;
    this.stickPointer = null;
    this.base.style.opacity = '0.35';
    this.knob.style.transform = 'translate(0px, 0px)';
    this.setStick(0, 0);
  };

  /** 8-way: an axis counts once it passes the deadzone and ~40% of the other axis. */
  private setStick(dx: number, dy: number) {
    const held = new Set<Action>();
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (ax > DEADZONE && ax > ay * 0.4) held.add(dx < 0 ? 'left' : 'right');
    if (ay > DEADZONE && ay > ax * 0.4) held.add(dy < 0 ? 'up' : 'down');
    for (const a of held) if (!this.stickHeld.has(a)) this.pressed.add(a);
    this.stickHeld = held;
  }

  private onButtonDown(e: PointerEvent, actions: Action[]) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    (e.currentTarget as HTMLElement).classList.add('down');
    this.buttonHeld.set(e.pointerId, actions);
    for (const a of actions) this.pressed.add(a);
  }

  private onButtonUp = (e: PointerEvent) => {
    (e.currentTarget as HTMLElement).classList.remove('down');
    this.buttonHeld.delete(e.pointerId);
  };

  poll() {
    const held = new Set<Action>(this.stickHeld);
    for (const actions of this.buttonHeld.values()) for (const a of actions) held.add(a);
    const pressed = this.pressed;
    this.pressed = new Set();
    // Screens with HTML forms (login, rooms) are driven by native touch: get out of the way.
    this.root.classList.toggle('mc-touch-hidden', document.querySelector('#game .mc-form') !== null);
    return { held, pressed };
  }

  dispose() {
    this.root.remove();
  }
}
