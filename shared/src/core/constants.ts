/** Simulation tick rate. Frame data (startup/active/recovery) is expressed in ticks. */
export const TICK_RATE = 60;
export const TICK_SECONDS = 1 / TICK_RATE;

/** Ticks an input press stays buffered while the fighter can't act yet. */
export const INPUT_BUFFER_TICKS = 6;

/** Ticks after walking off a ledge during which a ground jump is still allowed. */
export const COYOTE_TICKS = 5;

/** Ticks DOWN must be held on a one-way platform before dropping through it. */
export const DROP_THROUGH_HOLD_TICKS = 3;
export const DROP_THROUGH_IGNORE_TICKS = 12;

/** A KO counts for the last attacker only if it happens within this window after the hit. */
export const KO_CREDIT_TICKS = 6 * TICK_RATE;

export const RESPAWN_DELAY_TICKS = 70;
export const RESPAWN_INVULN_TICKS = 120;

export const MAX_DAMAGE = 999;
