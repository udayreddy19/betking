import './TeamJersey.css';

function resolveJerseyColor(color) {
  if (!color || color === '#e5e7eb' || color === '#ffffff') return '#5b7fb8';
  return color;
}

function resolveAccentColor(primary) {
  const hex = primary.replace('#', '');
  if (hex.length !== 6) return '#f5c518';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? '#f59e0b' : '#f5c518';
}

function shade(hex, amount) {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const clamp = (v) => Math.max(0, Math.min(255, v));
  const r = clamp(parseInt(h.slice(0, 2), 16) + amount);
  const g = clamp(parseInt(h.slice(2, 4), 16) + amount);
  const b = clamp(parseInt(h.slice(4, 6), 16) + amount);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export default function TeamJersey({ team, size = 44, className = '' }) {
  const primary = resolveJerseyColor(team?.color);
  const accent = team?.accentColor || resolveAccentColor(primary);
  const dark = shade(primary, -28);
  const light = shade(primary, 22);
  const height = Math.round(size * 1.18);
  const id = primary.replace('#', '');

  return (
    <div
      className={`team-jersey-kit ${className}`.trim()}
      style={{ width: size, height }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 64 76" width={size} height={height} className="team-jersey-kit__svg">
        <defs>
          <linearGradient id={`jb-${id}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={light} />
            <stop offset="55%" stopColor={primary} />
            <stop offset="100%" stopColor={dark} />
          </linearGradient>
          <linearGradient id={`js-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={light} />
            <stop offset="100%" stopColor={dark} />
          </linearGradient>
          <filter id={`jf-${id}`} x="-20%" y="-10%" width="140%" height="130%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.22" />
          </filter>
        </defs>

        <g filter={`url(#jf-${id})`}>
          <path d="M8 18 L2 30 L10 34 L14 24 Z" fill={`url(#js-${id})`} />
          <path d="M56 18 L62 30 L54 34 L50 24 Z" fill={`url(#js-${id})`} />
          <path d="M14 14 L50 14 L54 68 Q32 74 10 68 Z" fill={`url(#jb-${id})`} />
          <path d="M24 14 L32 24 L40 14 L36 14 L32 19 L28 14 Z" fill={dark} opacity="0.85" />
          <path d="M16 30 L48 30 L32 52 Z" fill={accent} opacity="0.95" />
          <path d="M12 58 L18 62 L14 68 Z" fill={accent} opacity="0.9" />
          <path d="M52 58 L46 62 L50 68 Z" fill={accent} opacity="0.9" />
          <path
            d="M18 18 Q32 22 46 18"
            stroke="rgba(255,255,255,0.18)"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
        </g>
      </svg>
    </div>
  );
}
