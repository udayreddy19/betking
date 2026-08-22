/**
 * Apple-inspired Motion spring presets (WWDC Designing Fluid Interfaces).
 * Critically damped by default; bounce only for momentum-driven gestures.
 */

/** Default UI — damping 1.0 / response ~0.35s (no overshoot) */
export const springUi = {
  type: 'spring',
  bounce: 0,
  duration: 0.35,
};

/** Sheet / drawer — slightly snappier response */
export const springSheet = {
  type: 'spring',
  bounce: 0,
  duration: 0.3,
};

/** Momentum / flick release — slight bounce only when a gesture carried velocity */
export const springMomentum = {
  type: 'spring',
  bounce: 0.2,
  duration: 0.35,
};

/** Tab / pill layout transitions */
export const springTab = {
  type: 'spring',
  bounce: 0,
  duration: 0.32,
};

/** Instant press feedback (pointer-down feel) */
export const pressScale = 0.97;
export const hoverScale = 1.03;
