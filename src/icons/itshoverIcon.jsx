/** Wrap itshover icons for consistent inline sizing across the app. */
export function withItshoverIcon(Icon) {
  function ItshoverIcon({ className = '', color, size = 20, style, ...props }) {
    return (
      <Icon
        className={`itshover-icon cursor-pointer ${className}`.trim()}
        color={color}
        size={size}
        style={{ display: 'inline-flex', flexShrink: 0, lineHeight: 0, ...style }}
        {...props}
      />
    );
  }

  ItshoverIcon.displayName = Icon.displayName || Icon.name || 'ItshoverIcon';
  return ItshoverIcon;
}
