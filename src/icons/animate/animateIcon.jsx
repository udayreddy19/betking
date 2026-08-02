/** Wrap @animateicons/react icons for consistent inline sizing across the app. */
export function withAnimatedIcon(Icon) {
  function AnimatedIcon({ className = '', color, size = 20, style, ...props }) {
    return (
      <Icon
        className={`animated-icon ${className}`.trim()}
        color={color}
        size={size}
        style={{ display: 'inline-flex', flexShrink: 0, lineHeight: 0, ...style }}
        {...props}
      />
    );
  }

  AnimatedIcon.displayName = Icon.displayName || Icon.name || 'AnimatedIcon';
  return AnimatedIcon;
}
