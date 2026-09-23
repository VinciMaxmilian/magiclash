/**
 * One tick of player intent, encoded as a bitmask (fits in one byte → cheap to send over
 * the network). The simulation derives "pressed this tick" edges by comparing with the
 * previous frame, so devices only need to report held state.
 */
export type InputFrame = number;

export const Btn = {
  Left: 1 << 0,
  Right: 1 << 1,
  Up: 1 << 2,
  Down: 1 << 3,
  Jump: 1 << 4,
  Light: 1 << 5,
  Heavy: 1 << 6,
  Dodge: 1 << 7,
} as const;

export type BtnName = keyof typeof Btn;

export const INPUT_MASK = 0xff;
export const EMPTY_INPUT: InputFrame = 0;

export const held = (frame: InputFrame, btn: number): boolean => (frame & btn) !== 0;

export const pressed = (frame: InputFrame, prev: InputFrame, btn: number): boolean =>
  (frame & btn) !== 0 && (prev & btn) === 0;

export const released = (frame: InputFrame, prev: InputFrame, btn: number): boolean =>
  (frame & btn) === 0 && (prev & btn) !== 0;

/** -1 left, 0 none/both, 1 right */
export const horizontalAxis = (frame: InputFrame): -1 | 0 | 1 => {
  const l = held(frame, Btn.Left);
  const r = held(frame, Btn.Right);
  return l === r ? 0 : l ? -1 : 1;
};

/** -1 up, 0 none/both, 1 down (screen-space) */
export const verticalAxis = (frame: InputFrame): -1 | 0 | 1 => {
  const u = held(frame, Btn.Up);
  const d = held(frame, Btn.Down);
  return u === d ? 0 : u ? -1 : 1;
};

/** Builds a frame from button names — handy in tests and bots. */
export const makeInput = (...names: BtnName[]): InputFrame =>
  names.reduce((acc, n) => acc | Btn[n], 0);

/** Rejects anything that is not a byte (network input validation). */
export const sanitizeInput = (raw: unknown): InputFrame =>
  typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw <= INPUT_MASK ? raw : EMPTY_INPUT;
