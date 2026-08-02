import { forwardRef, useRef, useCallback } from 'react';

/** Wrap itshover icons with cross-browser pointer hover (Chrome-safe). */
export function withItshoverIcon(Icon) {
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
      <span
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
        role="presentation"
      >
        <Icon
          ref={setRef}
          className="itshover-icon"
          color={color}
          size={size}
          {...props}
        />
      </span>
    );
  });

  Wrapped.displayName = Icon.displayName || Icon.name || 'ItshoverIcon';
  return Wrapped;
}
