/** Official team kit specs with authentic primary, accent, sleeve, collar colors & chest patterns. */

import { normalizeTeamKey } from '../data/cricketRosters';

export const TEAM_KIT_SPECS = {
  // International
  'india': { body: '#0038A8', accent: '#FF671F', sleeve: '#002675', collar: '#FF671F' },
  'ind': { body: '#0038A8', accent: '#FF671F', sleeve: '#002675', collar: '#FF671F' },
  'pakistan': { body: '#01411C', accent: '#F5E050', sleeve: '#012B12', collar: '#F5E050' },
  'pak': { body: '#01411C', accent: '#F5E050', sleeve: '#012B12', collar: '#F5E050' },
  'west indies': { body: '#7B002C', accent: '#FFD700', sleeve: '#56001F', collar: '#FFD700' },
  'wi': { body: '#7B002C', accent: '#FFD700', sleeve: '#56001F', collar: '#FFD700' },
  'australia': { body: '#FFCD00', accent: '#004B23', sleeve: '#E0B400', collar: '#004B23' },
  'aus': { body: '#FFCD00', accent: '#004B23', sleeve: '#E0B400', collar: '#004B23' },
  'england': { body: '#00246B', accent: '#CE1126', sleeve: '#001747', collar: '#CE1126' },
  'eng': { body: '#00246B', accent: '#CE1126', sleeve: '#001747', collar: '#CE1126' },
  'south africa': { body: '#007A4D', accent: '#FFB81C', sleeve: '#005737', collar: '#FFB81C' },
  'sa': { body: '#007A4D', accent: '#FFB81C', sleeve: '#005737', collar: '#FFB81C' },
  'new zealand': { body: '#1A1A1A', accent: '#FFFFFF', sleeve: '#0D0D0D', collar: '#FFFFFF' },
  'nz': { body: '#1A1A1A', accent: '#FFFFFF', sleeve: '#0D0D0D', collar: '#FFFFFF' },
  'sri lanka': { body: '#002060', accent: '#FFC000', sleeve: '#001440', collar: '#FFC000' },
  'sl': { body: '#002060', accent: '#FFC000', sleeve: '#001440', collar: '#FFC000' },
  'bangladesh': { body: '#006A4E', accent: '#F42A41', sleeve: '#004D39', collar: '#F42A41' },
  'ban': { body: '#006A4E', accent: '#F42A41', sleeve: '#004D39', collar: '#F42A41' },

  // IPL
  'chennai super kings': { body: '#FDB913', accent: '#00529C', sleeve: '#E2A20A', collar: '#00529C' },
  'csk': { body: '#FDB913', accent: '#00529C', sleeve: '#E2A20A', collar: '#00529C' },
  'mumbai indians': { body: '#004BA0', accent: '#D4AF37', sleeve: '#003470', collar: '#D4AF37' },
  'mi': { body: '#004BA0', accent: '#D4AF37', sleeve: '#003470', collar: '#D4AF37' },
  'kolkata knight riders': { body: '#3A225D', accent: '#F0C420', sleeve: '#271640', collar: '#F0C420' },
  'kkr': { body: '#3A225D', accent: '#F0C420', sleeve: '#271640', collar: '#F0C420' },
  'royal challengers bengaluru': { body: '#EC1C24', accent: '#000000', sleeve: '#121212', collar: '#D4AF37' },
  'rcb': { body: '#EC1C24', accent: '#000000', sleeve: '#121212', collar: '#D4AF37' },
  'sunrisers hyderabad': { body: '#FF8200', accent: '#000000', sleeve: '#121212', collar: '#000000' },
  'srh': { body: '#FF8200', accent: '#000000', sleeve: '#121212', collar: '#000000' },
  'rajasthan royals': { body: '#EA2B75', accent: '#004BA0', sleeve: '#003470', collar: '#004BA0' },
  'rr': { body: '#EA2B75', accent: '#004BA0', sleeve: '#003470', collar: '#004BA0' },
  'delhi capitals': { body: '#172B4D', accent: '#EF4444', sleeve: '#0E1C33', collar: '#EF4444' },
  'dc': { body: '#172B4D', accent: '#EF4444', sleeve: '#0E1C33', collar: '#EF4444' },
  'punjab kings': { body: '#DD1D21', accent: '#F5C518', sleeve: '#A81215', collar: '#F5C518' },
  'pbks': { body: '#DD1D21', accent: '#F5C518', sleeve: '#A81215', collar: '#F5C518' },
  'gujarat titans': { body: '#0B192C', accent: '#D4AF37', sleeve: '#050D18', collar: '#D4AF37' },
  'gt': { body: '#0B192C', accent: '#D4AF37', sleeve: '#050D18', collar: '#D4AF37' },
  'lucknow super giants': { body: '#009FB7', accent: '#FF6B35', sleeve: '#006F80', collar: '#FF6B35' },
  'lsg': { body: '#009FB7', accent: '#FF6B35', sleeve: '#006F80', collar: '#FF6B35' },
};

function hashStr(str = '') {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function getTeamKitSpec(team) {
  let nameStr = '';
  if (typeof team === 'string') {
    nameStr = team;
  } else if (team && typeof team === 'object') {
    nameStr = team.name || team.shortName || team.code || '';
  }

  const clean = nameStr.toLowerCase().trim();
  const normKey = normalizeTeamKey(clean).replace(/\s+/g, '');

  if (TEAM_KIT_SPECS[clean]) return TEAM_KIT_SPECS[clean];
  if (TEAM_KIT_SPECS[normKey]) return TEAM_KIT_SPECS[normKey];

  const kitKeys = Object.keys(TEAM_KIT_SPECS).sort((a, b) => b.length - a.length);
  for (const key of kitKeys) {
    if (key.length <= 3) continue;
    if (clean.includes(key)) return TEAM_KIT_SPECS[key];
  }

  // Fallback palette generated deterministically per team
  const seed = hashStr(nameStr || 'Team');
  const bodyHue = seed % 360;
  const accentHue = (seed + 120) % 360;

  return {
    body: `hsl(${bodyHue}, 75%, 36%)`,
    sleeve: `hsl(${bodyHue}, 80%, 25%)`,
    accent: `hsl(${accentHue}, 90%, 55%)`,
    collar: `hsl(${accentHue}, 90%, 55%)`,
  };
}
