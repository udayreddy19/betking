import { useId } from 'react';
import './TeamJersey.css';

function resolveJerseyColor(color) {
  if (!color || color === '#e5e7eb' || color === '#ffffff') return '#4a7ab5';
  return color;
}

function resolveAccentColor(primary) {
  const hex = primary.replace('#', '');
  if (hex.length !== 6) return '#e8b923';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? '#d4920a' : '#e8b923';
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

export default function TeamJersey({ team, size = 48, className = '' }) {
  const uid = useId().replace(/:/g, '');
  const primary = resolveJerseyColor(team?.color);
  const accent = team?.accentColor || resolveAccentColor(primary);
  const dark = shade(primary, -35);
  const mid = primary;
  const light = shade(primary, 30);
  const collar = shade(primary, -50);
  const height = Math.round(size * 1.2);

  return (
    <div
      className={`team-jersey-kit ${className}`.trim()}
      style={{ width: size, height }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 100 120"
        width={size}
        height={height}
        className="team-jersey-kit__svg"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id={`${uid}-body`} x1="30%" y1="0%" x2="70%" y2="100%">
            <stop offset="0%" stopColor={light} />
            <stop offset="40%" stopColor={mid} />
            <stop offset="100%" stopColor={dark} />
          </linearGradient>
          <linearGradient id={`${uid}-sleeve-l`} x1="100%" y1="20%" x2="0%" y2="80%">
            <stop offset="0%" stopColor={light} />
            <stop offset="100%" stopColor={dark} />
          </linearGradient>
          <linearGradient id={`${uid}-sleeve-r`} x1="0%" y1="20%" x2="100%" y2="80%">
            <stop offset="0%" stopColor={light} />
            <stop offset="100%" stopColor={dark} />
          </linearGradient>
          <linearGradient id={`${uid}-accent`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={shade(accent, 25)} />
            <stop offset="50%" stopColor={accent} />
            <stop offset="100%" stopColor={shade(accent, -20)} />
          </linearGradient>
          <radialGradient id={`${uid}-shine`} cx="35%" cy="25%" r="45%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.35)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
          <filter id={`${uid}-shadow`} x="-15%" y="-8%" width="130%" height="125%">
            <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000" floodOpacity="0.2" />
          </filter>
        </defs>

        <g filter={`url(#${uid}-shadow)`}>
          {/* Left sleeve */}
          <path
            d="M 22 18
               C 14 18, 8 24, 6 32
               C 4 38, 6 44, 12 46
               C 17 47, 22 43, 24 36
               C 26 28, 25 20, 22 18 Z"
            fill={`url(#${uid}-sleeve-l)`}
          />
          {/* Right sleeve */}
          <path
            d="M 78 18
               C 86 18, 92 24, 94 32
               C 96 38, 94 44, 88 46
               C 83 47, 78 43, 76 36
               C 74 28, 75 20, 78 18 Z"
            fill={`url(#${uid}-sleeve-r)`}
          />

          {/* Main torso */}
          <path
            d="M 26 16
               C 30 14, 36 13, 50 13
               C 64 13, 70 14, 74 16
               L 80 28
               C 82 34, 83 42, 82 52
               L 80 88
               C 78 96, 72 102, 50 104
               C 28 102, 22 96, 20 88
               L 18 52
               C 17 42, 18 34, 20 28
               Z"
            fill={`url(#${uid}-body)`}
          />

          {/* V-neck collar */}
          <path
            d="M 36 16
               L 50 30
               L 64 16
               C 60 15, 55 14, 50 14
               C 45 14, 40 15, 36 16 Z"
            fill={collar}
          />
          <path
            d="M 38 16.5 L 50 27.5 L 62 16.5"
            stroke="rgba(255,255,255,0.15)"
            strokeWidth="0.8"
            fill="none"
            strokeLinecap="round"
          />

          {/* Chest chevron — wide V band like real kit */}
          <path
            d="M 18 36
               L 82 36
               L 50 62
               Z"
            fill={`url(#${uid}-accent)`}
          />
          <path
            d="M 24 37.5 L 50 58.5 L 76 37.5"
            stroke="rgba(0,0,0,0.07)"
            strokeWidth="0.8"
            fill="none"
          />

          {/* Lower side accents */}
          <path
            d="M 21 86
               C 24 92, 30 97, 36 100
               L 32 101
               C 26 98, 21 92, 20 87
               Z"
            fill={`url(#${uid}-accent)`}
          />
          <path
            d="M 79 86
               C 76 92, 70 97, 64 100
               L 68 101
               C 74 98, 79 92, 80 87
               Z"
            fill={`url(#${uid}-accent)`}
          />

          {/* Fabric shine */}
          <ellipse cx="38" cy="32" rx="18" ry="22" fill={`url(#${uid}-shine)`} />

          {/* Subtle seam lines */}
          <path
            d="M 24 28 C 30 26, 40 25, 50 25 C 60 25, 70 26, 76 28"
            stroke="rgba(0,0,0,0.06)"
            strokeWidth="0.6"
            fill="none"
          />
          <path
            d="M 22 46 C 34 44, 66 44, 78 46"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="0.5"
            fill="none"
          />
        </g>
      </svg>
    </div>
  );
}
