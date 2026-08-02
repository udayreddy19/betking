/**
 * Pointer-based hover handlers for animated icons.
 * Motion's onHoverStart is unreliable on SVG in Chrome; pointer events work everywhere.
 */
export function iconHoverProps(onEnter, onLeave) {
  return {
    onPointerEnter: onEnter,
    onPointerLeave: onLeave,
  };
}
