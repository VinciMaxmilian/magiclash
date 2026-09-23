import { Btn, type InputFrame } from '@magiclash/shared';

/**
 * Abstract actions. Character logic never sees keys: devices → actions → InputFrame.
 * Menu actions (confirm/back/pause) share devices but never reach the simulation.
 */
export type Action =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'jump'
  | 'light'
  | 'heavy'
  | 'dodge'
  | 'pause'
  | 'confirm'
  | 'back'
  | 'debug'
  | 'slowmo';

export const GAMEPLAY_BITS: Partial<Record<Action, number>> = {
  left: Btn.Left,
  right: Btn.Right,
  up: Btn.Up,
  down: Btn.Down,
  jump: Btn.Jump,
  light: Btn.Light,
  heavy: Btn.Heavy,
  dodge: Btn.Dodge,
};

export const actionsToFrame = (actions: Iterable<Action>): InputFrame => {
  let f = 0;
  for (const a of actions) f |= GAMEPLAY_BITS[a] ?? 0;
  return f;
};

/** Default keyboard layout (KeyboardEvent.code → actions). Remappable later via settings. */
export const DEFAULT_KEY_BINDINGS: Record<string, Action[]> = {
  KeyA: ['left'],
  KeyD: ['right'],
  KeyW: ['up'],
  KeyS: ['down'],
  ArrowLeft: ['left'],
  ArrowRight: ['right'],
  ArrowUp: ['up'],
  ArrowDown: ['down'],
  Space: ['jump', 'confirm'],
  KeyJ: ['light', 'confirm'],
  KeyZ: ['light'],
  KeyK: ['heavy'],
  KeyX: ['heavy'],
  KeyL: ['dodge'],
  KeyC: ['dodge'],
  ShiftLeft: ['dodge'],
  ShiftRight: ['dodge'],
  Enter: ['confirm'],
  NumpadEnter: ['confirm'],
  Escape: ['pause', 'back'],
  KeyP: ['pause'],
  Backspace: ['back'],
  F1: ['debug'],
  F2: ['slowmo'],
};

/** Standard Gamepad mapping (https://w3c.github.io/gamepad/#remapping). */
export const DEFAULT_PAD_BINDINGS: Record<number, Action[]> = {
  0: ['jump', 'confirm'], // A / Cross
  1: ['heavy', 'back'], // B / Circle
  2: ['light'], // X / Square
  3: ['heavy'], // Y / Triangle
  4: ['dodge'], // LB
  5: ['dodge'], // RB
  6: ['dodge'], // LT
  7: ['dodge'], // RT
  9: ['pause'], // Start
  12: ['up'],
  13: ['down'],
  14: ['left'],
  15: ['right'],
};

export const CONTROL_HINTS = [
  ['MOVER', 'A D / ~ |'],
  ['MIRAR', 'W S / { }'],
  ['PULAR', 'ESPAÇO'],
  ['ATAQUE LEVE', 'J / Z'],
  ['ATAQUE PESADO', 'K / X'],
  ['ESQUIVA', 'L / C / SHIFT'],
  ['PAUSA', 'ESC'],
  ['TELA CHEIA', 'F'],
] as const;
