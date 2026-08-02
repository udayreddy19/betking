import { useId, useMemo } from 'react';
import { getJerseyPalette } from '../../utils/jerseyColors';
import './TeamJersey.css';

/**
 * 3D cricket jersey icon — matches approved mockup.
 * Body color = team.color (or name-derived). Chevron/hem = contrasting accent.
 */
export default function TeamJersey({ team, size = 52, className = '' }) {
  const uid = useId().replace(/:/g, '');
  const palette = useMemo(() => getJerseyPalette(team), [team?.color, team?.accentColor, team?.name, team?.shortName]);
  const height = Math.round(size * 1.22);

  const bodyPath = `
    M 36 12
    C 44 10, 56 9, 64 9
    C 72 9, 84 10, 92 12
    C 98 14, 102 18, 104 24
    L 108 32
    C 110 40, 111 50, 110 60
    L 106 98
    C 104 108, 96 116, 64 120
    C 32 116, 24 108, 22 98
    L 18 60
    C 17 50, 18 40, 20 32
    L 24 24
    C 26 18, 30 14, 36 12
    Z
  `;

  const sleeveL = `
    M 28 24
    C 18 22, 10 28, 6 38
    C 2 48, 4 58, 12 62
    C 18 64, 24 60, 26 50
    C 28 40, 28 30, 28 24
    Z
  `;

  const sleeveR = `
    M 100 24
    C 110 22, 118 28, 122 38
    C 126 48, 124 58, 116 62
    C 110 64, 104 60, 102 50
    C 100 40, 100 30, 100 24
    Z
  `;

  return (
    <div
      className={`team-jersey-kit ${className}`.trim()}
      style={{ width: size, height }}
      aria-hidden="true"
      title={team?.name || undefined}
    >
      <svg
        viewBox="0 0 128 132"
        width={size}
        height={height}
        className="team-jersey-kit__svg"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <clipPath id={`${uid}-body`}>
            <path d={bodyPath} />
          </clipPath>

          <linearGradient id={`${uid}-fabric`} x1="22%" y1="0%" x2="78%" y2="100%">
            <stop offset="0%" stopColor={palette.light} />
            <stop offset="38%" stopColor={palette.mid} />
            <stop offset="78%" stopColor={palette.shade} />
            <stop offset="100%" stopColor={palette.dark} />
          </linearGradient>

          <linearGradient id={`${uid}-sleeve`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={palette.light} />
            <stop offset="100%" stopColor={palette.dark} />
          </linearGradient>

          <linearGradient id={`${uid}-accent`} x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor={palette.accentHi} />
            <stop offset="50%" stopColor={palette.accent} />
            <stop offset="100%" stopColor={palette.accentLo} />
          </linearGradient>

          <radialGradient id={`${uid}-shine`} cx="30%" cy="16%" r="46%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.45)" />
            <stop offset="65%" stopColor="rgba(255,255,255,0.1)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>

          <filter id={`${uid}-shadow`} x="-18%" y="-12%" width="136%" height="135%">
            <feDropShadow dx="0" dy="4" stdDeviation="4.5" floodColor="#0f172a" floodOpacity="0.24" />
          </filter>
        </defs>

        <g filter={`url(#${uid}-shadow)`}>
          <path d={sleeveL} fill={`url(#${uid}-sleeve)`} />
          <path d={sleeveR} fill={`url(#${uid}-sleeve)`} />
          <path d={bodyPath} fill={`url(#${uid}-fabric)`} />

          {/* V-neck collar */}
          <path
            d="M 46 12 C 52 10, 58 9, 64 9 C 70 9, 76 10, 82 12 L 64 28 Z"
            fill={palette.collar}
          />
          <path
            d="M 48 12.5 L 64 25.5 L 80 12.5"
            fill="none"
            stroke="rgba(255,255,255,0.22)"
            strokeWidth="0.75"
            strokeLinecap="round"
          />

          <g clipPath={`url(#${uid}-body)`}>
            {/* Chest chevron */}
            <path
              d="M 20 42
                 L 108 42
                 L 64 86
                 Z"
              fill={`url(#${uid}-accent)`}
            />
            <path
              d="M 26 43.5 L 64 80.5 L 102 43.5"
              fill="none"
              stroke="rgba(0,0,0,0.06)"
              strokeWidth="0.8"
            />

            {/* Hem corner panels */}
            <path d="M 26 98 L 36 112 L 28 114 Z" fill={`url(#${uid}-accent)`} />
            <path d="M 102 98 L 92 112 L 100 114 Z" fill={`url(#${uid}-accent)`} />

            <ellipse cx="44" cy="28" rx="30" ry="36" fill={`url(#${uid}-shine)`} />
          </g>

          <path
            d="M 32 28 C 48 25, 80 25, 96 28"
            stroke="rgba(0,0,0,0.05)"
            strokeWidth="0.65"
            fill="none"
          />
        </g>
      </svg>
    </div>
  );
}
