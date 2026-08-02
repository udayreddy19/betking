import './ui.css';

export default function LivePulse({ label = 'LIVE', className = '', animate = true }) {
  return (
    <span className={`ui-live-pulse ${className}`.trim()}>
      <span className={`ui-live-pulse__dot ${animate ? 'ui-live-pulse__dot--animated' : ''}`} />
      {label && <span className="ui-live-pulse__label">{label}</span>}
    </span>
  );
}
