import './ui.css';

export default function Badge({
  children,
  variant = 'muted',
  className = '',
  ...props
}) {
  return (
    <span className={`ui-badge ui-badge--${variant} ${className}`.trim()} {...props}>
      {children}
    </span>
  );
}
