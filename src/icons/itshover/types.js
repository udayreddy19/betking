/** @typedef {import('react').SVGProps<SVGSVGElement>} SVGProps */

export const DEFAULT_STROKE_WIDTH = 2;

export function scaledStrokeWidth(strokeWidth, viewBoxSize) {
  return strokeWidth * (viewBoxSize / 24);
}

/** @typedef {{ startAnimation: () => void, stopAnimation: () => void }} AnimatedIconHandle */

/** @typedef {Omit<SVGProps, 'ref' | 'onAnimationStart' | 'onAnimationEnd' | 'onAnimationIteration' | 'onDrag' | 'onDragEnd' | 'onDragEnter' | 'onDragExit' | 'onDragLeave' | 'onDragOver' | 'onDragStart' | 'onDrop' | 'values'> & { size?: number | string, color?: string, strokeWidth?: number, className?: string }} AnimatedIconProps */
