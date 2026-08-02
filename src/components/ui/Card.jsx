import './ui.css';

export default function Card({
  children,
  className = '',
  glass = false,
  interactive = false,
  ...props
}) {
  const classes = [
    'ui-card',
    glass && 'ui-card--glass',
    interactive && 'ui-card--interactive',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
}
