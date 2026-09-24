import type { InputFrame } from '@magiclash/shared';
import { DEFAULT_KEY_BINDINGS, DEFAULT_PAD_BINDINGS, actionsToFrame, type Action } from './actions';

/**
 * A device that reports which actions are held right now, plus actions pressed since the
 * last poll (so a tap shorter than one simulation tick is never lost).
 */
export interface InputSource {
  poll(): { held: Set<Action>; pressed: Set<Action> };
  dispose(): void;
}

export class KeyboardSource implements InputSource {
  private held = new Map<string, Action[]>();
  private pressed = new Set<Action>();

  constructor(
    private readonly target: Window,
    private readonly bindings: Record<string, Action[]> = DEFAULT_KEY_BINDINGS,
  ) {
    target.addEventListener('keydown', this.onDown);
    target.addEventListener('keyup', this.onUp);
    target.addEventListener('blur', this.onBlur);
  }

  /** Typing in a text field (login form, names) must not move the fighter or be swallowed. */
  private static isTyping(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  }

  private onDown = (e: KeyboardEvent) => {
    if (KeyboardSource.isTyping(e)) return;
    const actions = this.bindings[e.code];
    if (!actions) return;
    e.preventDefault(); // no page scroll on Space/arrows, no browser F1 help
    if (e.repeat) return;
    this.held.set(e.code, actions);
    for (const a of actions) this.pressed.add(a);
  };

  private onUp = (e: KeyboardEvent) => {
    this.held.delete(e.code);
  };

  /** Losing focus would otherwise leave keys stuck "held". */
  private onBlur = () => {
    this.held.clear();
  };

  poll() {
    const held = new Set<Action>();
    for (const actions of this.held.values()) for (const a of actions) held.add(a);
    const pressed = this.pressed;
    this.pressed = new Set();
    return { held, pressed };
  }

  dispose() {
    this.target.removeEventListener('keydown', this.onDown);
    this.target.removeEventListener('keyup', this.onUp);
    this.target.removeEventListener('blur', this.onBlur);
  }
}

export class GamepadSource implements InputSource {
  private prev = new Set<Action>();
  private readonly deadzone = 0.45;

  constructor(private readonly bindings: Record<number, Action[]> = DEFAULT_PAD_BINDINGS) {}

  poll() {
    const held = new Set<Action>();
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      pad.buttons.forEach((b, i) => {
        if (b.pressed) for (const a of this.bindings[i] ?? []) held.add(a);
      });
      const [ax = 0, ay = 0] = pad.axes;
      if (ax < -this.deadzone) held.add('left');
      if (ax > this.deadzone) held.add('right');
      if (ay < -this.deadzone) held.add('up');
      if (ay > this.deadzone) held.add('down');
    }
    const pressed = new Set([...held].filter((a) => !this.prev.has(a)));
    this.prev = held;
    return { held, pressed };
  }

  dispose() {}
}

// Touch controls: TouchSource.ts (same interface; only created on touch devices).

export class InputManager {
  private sources: InputSource[];
  private held = new Set<Action>();
  private justPressed = new Set<Action>();
  private latched = new Set<Action>();

  constructor(sources: InputSource[]) {
    this.sources = sources;
  }

  /** Call once per rendered frame. */
  update(): void {
    const held = new Set<Action>();
    const pressed = new Set<Action>();
    for (const s of this.sources) {
      const r = s.poll();
      r.held.forEach((a) => held.add(a));
      r.pressed.forEach((a) => pressed.add(a));
    }
    this.held = held;
    this.justPressed = pressed;
    pressed.forEach((a) => this.latched.add(a));
  }

  isHeld(a: Action): boolean {
    return this.held.has(a);
  }

  /** Edge for menus/UI: pressed since the previous update(). */
  wasPressed(a: Action): boolean {
    return this.justPressed.has(a);
  }

  /** Consumes a UI press so two handlers don't react to the same key in one frame. */
  consume(a: Action): boolean {
    const had = this.justPressed.has(a);
    this.justPressed.delete(a);
    return had;
  }

  /**
   * Input for one simulation tick: held actions plus anything tapped since the last
   * tick (latched), so very short taps still register.
   */
  gameplayFrame(): InputFrame {
    const f = actionsToFrame([...this.held, ...this.latched]);
    this.latched.clear();
    return f;
  }

  /** Clears pending presses (e.g. when leaving a menu so Enter doesn't leak into the game). */
  flush(): void {
    this.justPressed.clear();
    this.latched.clear();
  }

  dispose(): void {
    this.sources.forEach((s) => s.dispose());
  }
}
