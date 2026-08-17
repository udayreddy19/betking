import { useMemo, useId } from 'react';
import { getTeamKitSpec } from '../../utils/teamKitSpecs';
import { formatTeamShortName } from '../../utils/teamShortName';

/** Authentic SVG 3D team jersey designs for international & IPL teams. */
export function AuthenticTeamJerseySvg({ teamName, size = 52, isFlying = false, className = '' }) {
  const uid = useId().replace(/:/g, '');
  const normKey = useMemo(() => {
    const raw = String(teamName || '').toLowerCase().trim();
    if (/\b(ind|india)\b/i.test(raw)) return 'ind';
    if (/\b(pak|pakistan)\b/i.test(raw)) return 'pak';
    if (/\b(wi|west indies|windies)\b/i.test(raw)) return 'wi';
    if (/\b(aus|australia)\b/i.test(raw)) return 'aus';
    if (/\b(eng|england)\b/i.test(raw)) return 'eng';
    if (/\b(sa|south africa)\b/i.test(raw)) return 'sa';
    if (/\b(nz|new zealand|kiwis)\b/i.test(raw)) return 'nz';
    if (/\b(sl|sri lanka)\b/i.test(raw)) return 'sl';
    if (/\b(ban|bangladesh)\b/i.test(raw)) return 'ban';
    if (/\b(csk|chennai)\b/i.test(raw)) return 'csk';
    if (/\b(mi|mumbai)\b/i.test(raw)) return 'mi';
    if (/\b(kkr|kolkata)\b/i.test(raw)) return 'kkr';
    if (/\b(rcb|bengaluru|bangalore)\b/i.test(raw)) return 'rcb';
    if (/\b(srh|sunrisers|hyderabad)\b/i.test(raw)) return 'srh';
    if (/\b(rr|rajasthan)\b/i.test(raw)) return 'rr';
    if (/\b(dc|delhi)\b/i.test(raw)) return 'dc';
    if (/\b(pbks|punjab)\b/i.test(raw)) return 'pbks';
    if (/\b(gt|gujarat)\b/i.test(raw)) return 'gt';
    if (/\b(lsg|lucknow)\b/i.test(raw)) return 'lsg';
    return 'default';
  }, [teamName]);

  const height = Math.round(size * 1.18);

  const getJerseyDetails = (key) => {
    switch (key) {
      case 'ind':
        return {
          primary: '#0038A8',
          secondary: '#FF671F',
          sleeve: '#002675',
          collar: '#FF671F',
          text: 'INDIA',
          badge: '🇮🇳',
          pattern: (
            <>
              {/* Orange Tri-color Shoulder Stripes */}
              <line x1="28" y1="26" x2="38" y2="48" stroke="#FF671F" strokeWidth="2.5" />
              <line x1="72" y1="26" x2="62" y2="48" stroke="#FF671F" strokeWidth="2.5" />
              {/* Subtle Tricolor Wave */}
              <path d="M 30,58 Q 50,68 70,58" fill="none" stroke="#FF671F" strokeWidth="1.8" opacity="0.85" />
            </>
          ),
        };

      case 'pak':
        return {
          primary: '#01411C',
          secondary: '#F5E050',
          sleeve: '#012A12',
          collar: '#F5E050',
          text: 'PAKISTAN',
          badge: '🌙',
          pattern: (
            <>
              {/* Star V-Shape Graphic */}
              <polygon points="28,26 50,56 72,26 64,26 50,46 36,26" fill="#F5E050" opacity="0.9" />
              {/* Crescent Star Emblem Accent */}
              <circle cx="50" cy="74" r="5" fill="#F5E050" opacity="0.9" />
            </>
          ),
        };

      case 'wi':
        return {
          primary: '#7B002C',
          secondary: '#FFD700',
          sleeve: '#56001F',
          collar: '#FFD700',
          text: 'WINDIES',
          badge: '🌴',
          pattern: (
            <>
              <polygon points="28,26 50,52 72,26 64,26 50,42 36,26" fill="#FFD700" opacity="0.95" />
              <path d="M 27,95 Q 50,105 73,95 L 73,105 L 27,105 Z" fill="#FFD700" opacity="0.9" />
            </>
          ),
        };

      case 'aus':
        return {
          primary: '#FFCD00',
          secondary: '#004B23',
          sleeve: '#E0B400',
          collar: '#004B23',
          text: 'AUSTRALIA',
          badge: '🦘',
          pattern: (
            <>
              {/* Dark Green Side Panels */}
              <path d="M 27,48 Q 26,75 27,105 L 34,105 Q 33,75 34,48 Z" fill="#004B23" opacity="0.9" />
              <path d="M 73,48 Q 74,75 73,105 L 66,105 Q 67,75 66,48 Z" fill="#004B23" opacity="0.9" />
            </>
          ),
        };

      case 'eng':
        return {
          primary: '#00246B',
          secondary: '#CE1126',
          sleeve: '#001747',
          collar: '#CE1126',
          text: 'ENGLAND',
          badge: '🦁',
          pattern: (
            <>
              <line x1="28" y1="26" x2="38" y2="48" stroke="#CE1126" strokeWidth="3" />
              <line x1="72" y1="26" x2="62" y2="48" stroke="#CE1126" strokeWidth="3" />
            </>
          ),
        };

      case 'sa':
        return {
          primary: '#007A4D',
          secondary: '#FFB81C',
          sleeve: '#005737',
          collar: '#FFB81C',
          text: 'SOUTH AFRICA',
          badge: '🌺',
          pattern: (
            <>
              <polygon points="28,26 50,54 72,26 64,26 50,44 36,26" fill="#FFB81C" opacity="0.95" />
            </>
          ),
        };

      case 'nz':
        return {
          primary: '#1A1A1A',
          secondary: '#FFFFFF',
          sleeve: '#0D0D0D',
          collar: '#FFFFFF',
          text: 'BLACKCAPS',
          badge: '🌿',
          pattern: (
            <>
              <path d="M 30,50 L 70,50 L 68,54 L 32,54 Z" fill="#FFFFFF" opacity="0.9" />
            </>
          ),
        };

      case 'sl':
        return {
          primary: '#002060',
          secondary: '#FFC000',
          sleeve: '#001440',
          collar: '#FFC000',
          text: 'SRI LANKA',
          badge: '🦁',
          pattern: (
            <>
              <polygon points="28,26 50,58 72,26 63,26 50,47 37,26" fill="#FFC000" opacity="0.95" />
            </>
          ),
        };

      case 'csk':
        return {
          primary: '#FDB913',
          secondary: '#00529C',
          sleeve: '#E2A20A',
          collar: '#00529C',
          text: 'CSK',
          badge: '🦁',
          pattern: (
            <>
              <path d="M 27,48 Q 26,75 27,105 L 33,105 Q 32,75 33,48 Z" fill="#00529C" opacity="0.9" />
              <path d="M 73,48 Q 74,75 73,105 L 67,105 Q 68,75 67,48 Z" fill="#00529C" opacity="0.9" />
            </>
          ),
        };

      case 'mi':
        return {
          primary: '#004BA0',
          secondary: '#D4AF37',
          sleeve: '#003470',
          collar: '#D4AF37',
          text: 'MUMBAI',
          badge: '⚡',
          pattern: (
            <>
              <line x1="28" y1="26" x2="38" y2="48" stroke="#D4AF37" strokeWidth="2.5" />
              <line x1="72" y1="26" x2="62" y2="48" stroke="#D4AF37" strokeWidth="2.5" />
            </>
          ),
        };

      case 'kkr':
        return {
          primary: '#3A225D',
          secondary: '#F0C420',
          sleeve: '#271640',
          collar: '#F0C420',
          text: 'KKR',
          badge: '👑',
          pattern: (
            <>
              <polygon points="28,26 50,55 72,26 64,26 50,45 36,26" fill="#F0C420" opacity="0.95" />
            </>
          ),
        };

      case 'rcb':
        return {
          primary: '#EC1C24',
          secondary: '#000000',
          sleeve: '#121212',
          collar: '#D4AF37',
          text: 'RCB',
          badge: '🦁',
          pattern: (
            <>
              <path d="M 27,62 L 73,62 L 73,105 L 27,105 Z" fill="#121212" opacity="0.95" />
              <line x1="27" y1="62" x2="73" y2="62" stroke="#D4AF37" strokeWidth="2" />
            </>
          ),
        };

      case 'srh':
        return {
          primary: '#FF8200',
          secondary: '#000000',
          sleeve: '#121212',
          collar: '#000000',
          text: 'SRH',
          badge: '🦅',
          pattern: (
            <>
              <line x1="28" y1="26" x2="38" y2="48" stroke="#000000" strokeWidth="3" />
              <line x1="72" y1="26" x2="62" y2="48" stroke="#000000" strokeWidth="3" />
            </>
          ),
        };

      case 'rr':
        return {
          primary: '#EA2B75',
          secondary: '#004BA0',
          sleeve: '#003470',
          collar: '#004BA0',
          text: 'ROYALS',
          badge: '👑',
          pattern: (
            <>
              <polygon points="28,26 50,54 72,26 64,26 50,44 36,26" fill="#004BA0" opacity="0.95" />
            </>
          ),
        };

      default: {
        const kit = getTeamKitSpec(teamName);
        const label = formatTeamShortName(String(teamName || ''), '').slice(0, 5);
        return {
          primary: kit.body,
          secondary: kit.accent,
          sleeve: kit.sleeve,
          collar: kit.collar,
          text: label,
          badge: '',
          pattern: (
            <polygon points="28,26 50,52 72,26 64,26 50,42 36,26" fill={kit.accent} opacity="0.9" />
          ),
        };
      }
    }
  };

  const details = getJerseyDetails(normKey);

  return (
    <div
      className={`team-jersey-kit ${isFlying ? 'team-jersey-kit--flying' : ''} ${className}`.trim()}
      style={{ width: size, height }}
      aria-hidden="true"
      title={teamName}
    >
      <svg
        viewBox="0 0 100 115"
        className="team-jersey-svg"
        style={{ width: size, height }}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id={`body-grad-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={details.primary} />
            <stop offset="70%" stopColor={details.primary} />
            <stop offset="100%" stopColor={details.sleeve} />
          </linearGradient>

          <linearGradient id={`sleeve-grad-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={details.sleeve} />
            <stop offset="100%" stopColor={details.primary} />
          </linearGradient>

          <linearGradient id={`shine-3d-${uid}`} x1="0.2" y1="0" x2="0.8" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.32" />
            <stop offset="35%" stopColor="#ffffff" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.3" />
          </linearGradient>
        </defs>

        {/* Drop Shadow */}
        <ellipse cx="50" cy="110" rx="35" ry="4.5" fill="#000000" opacity="0.25" />

        {/* Left Sleeve */}
        <path
          d="M 28,26 L 6,42 L 14,64 L 32,48 Z"
          fill={`url(#sleeve-grad-${uid})`}
          stroke="#000000"
          strokeWidth="0.8"
          strokeOpacity="0.3"
        />
        <polygon points="6,42 14,64 18,61 10,40" fill={details.secondary} />

        {/* Right Sleeve */}
        <path
          d="M 72,26 L 94,42 L 86,64 L 68,48 Z"
          fill={`url(#sleeve-grad-${uid})`}
          stroke="#000000"
          strokeWidth="0.8"
          strokeOpacity="0.3"
        />
        <polygon points="94,42 86,64 82,61 90,40" fill={details.secondary} />

        {/* Main Torso */}
        <path
          d="M 28,26 Q 50,33 72,26 L 68,48 L 73,105 Q 50,108 27,105 L 32,48 Z"
          fill={`url(#body-grad-${uid})`}
          stroke="#000000"
          strokeWidth="0.8"
          strokeOpacity="0.35"
        />

        {/* Custom Team Chest Pattern */}
        {details.pattern}

        {/* Collar Trim */}
        <path
          d="M 36,26 C 42,37 58,37 64,26 C 58,32 42,32 36,26 Z"
          fill={details.collar}
          stroke="#000000"
          strokeWidth="0.5"
          strokeOpacity="0.4"
        />

        {/* 3D Lighting Shading */}
        <path
          d="M 28,26 Q 50,33 72,26 L 68,48 L 73,105 Q 50,108 27,105 L 32,48 Z"
          fill={`url(#shine-3d-${uid})`}
        />

        {/* Team Chest Name Badge */}
        <rect x="34" y="60" width="32" height="13" rx="3" fill="#ffffff" opacity="0.94" />
        <text
          x="50"
          y="70"
          fill="#0f172a"
          fontSize="7.5"
          fontWeight="900"
          fontFamily="system-ui, -apple-system, sans-serif"
          textAnchor="middle"
          letterSpacing="0.4"
        >
          {details.text}
        </text>
      </svg>
    </div>
  );
}
