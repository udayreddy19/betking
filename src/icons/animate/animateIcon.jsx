import { forwardRef, useRef, useCallback } from 'react';

/** Wrap @animateicons/react icons with cross-browser pointer hover (Chrome-safe). */
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
      <span
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
      </span>
    );
  });

  Wrapped.displayName = Icon.displayName || Icon.name || 'AnimatedIcon';
  return Wrapped;
}
