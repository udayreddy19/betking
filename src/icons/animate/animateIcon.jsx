import { forwardRef, useRef, useCallback } from 'react';
import { motion } from 'motion/react';

/** Wrap @animateicons/react icons with Framer Motion hover feedback & animations. */
export function withAnimatedIcon(Icon) {
  const Wrapped = forwardRef(function AnimatedIcon(
    {
      className = '',
      color,
      size = 20,
      style,
      onPointerEnter,
      onPointerLeave,
      ...props
    },
    forwardedRef,
  ) {
    const iconRef = useRef(null);

    const start = useCallback((event) => {
      iconRef.current?.startAnimation?.();
      onPointerEnter?.(event);
    }, [onPointerEnter]);

    const stop = useCallback((event) => {
      iconRef.current?.stopAnimation?.();
      onPointerLeave?.(event);
    }, [onPointerLeave]);

    const setRef = useCallback((node) => {
      iconRef.current = node;
      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    }, [forwardedRef]);

    return (
      <motion.span
        className={`animated-icon-wrap ${className}`.trim()}
        style={{
          display: 'inline-flex',
          flexShrink: 0,
          lineHeight: 0,
          verticalAlign: 'middle',
          touchAction: 'manipulation',
          ...style,
        }}
        onPointerEnter={start}
        onPointerLeave={stop}
        whileHover={{
          scale: 1.2,
          rotate: [0, -8, 8, 0],
        }}
        whileTap={{ scale: 0.88 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        role="presentation"
      >
        <Icon
          ref={setRef}
          className="animated-icon"
          color={color}
          size={size}
          isAnimated={false}
          {...props}
        />
      </motion.span>
    );
  });

  Wrapped.displayName = Icon.displayName || Icon.name || 'AnimatedIcon';
  return Wrapped;
}
