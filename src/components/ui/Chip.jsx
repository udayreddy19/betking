import './ui.css';

export default function Chip({
  children,
  active = false,
  className = '',
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      className={`ui-chip ${active ? 'ui-chip--active' : ''} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}
