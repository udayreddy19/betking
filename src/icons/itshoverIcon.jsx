import { forwardRef, useRef, useCallback } from 'react';
import { motion } from 'motion/react';

/** Wrap itshover icons with Framer Motion hover feedback & animations. */
export function withItshoverIcon(Icon) {
  if (typeof Icon !== 'function') {
    const Fallback = forwardRef(function MissingItshoverIcon(props, forwardedRef) {
      return <span ref={forwardedRef} className={props.className} aria-hidden="true" />;
    });
    Fallback.displayName = 'MissingItshoverIcon';
    return Fallback;
  }

  const Wrapped = forwardRef(function ItshoverIcon(
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
        className={`itshover-icon-wrap ${className}`.trim()}
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
        whileHover={{ scale: 1.15 }}
        whileTap={{ scale: 0.88 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        role="presentation"
      >
        <Icon
          ref={setRef}
          className="itshover-icon"
          color={color}
          size={size}
          {...props}
        />
      </motion.span>
    );
  });

  Wrapped.displayName = Icon.displayName || Icon.name || 'ItshoverIcon';
  return Wrapped;
}
