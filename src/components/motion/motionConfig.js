import { motionDuration } from './useReducedMotion';

export function getTransition(reduced, { duration = 0.3, ease = [0.4, 0, 0.2, 1] } = {}) {
  return { duration: motionDuration(reduced, duration), ease };
}

export const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export const scaleIn = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.96 },
};
