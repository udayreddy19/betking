/** Map team names to ISO flag codes (flagcdn) and batting-side helpers. */

import { isCricketSecondInnings, teamNameMatches } from './cricketScores';
import { formatTeamShortName } from './teamShortName';

const FLAG_CDN = 'https://flagcdn.com';

/** Exact / alias labels → flagcdn code. `wi` is rendered as a custom SVG. */
const COUNTRY_ALIASES = {
  india: 'in',
  ind: 'in',
  bharat: 'in',
  bharath: 'in',
  pakistan: 'pk',
  pak: 'pk',
  australia: 'au',
  aus: 'au',
  england: 'gb-eng',
  eng: 'gb-eng',
  'new zealand': 'nz',
  nz: 'nz',
  kiwis: 'nz',
  'sri lanka': 'lk',
  sl: 'lk',
  bangladesh: 'bd',
  ban: 'bd',
  'south africa': 'za',
  sa: 'za',
  proteas: 'za',
  afghanistan: 'af',
  afg: 'af',
  ireland: 'ie',
  ire: 'ie',
  scotland: 'gb-sct',
  sco: 'gb-sct',
  wales: 'gb-wls',
  zim: 'zw',
  zimbabwe: 'zw',
  namibia: 'na',
  nepal: 'np',
  oman: 'om',
  uae: 'ae',
  'united arab emirates': 'ae',
  netherlands: 'nl',
  holland: 'nl',
  ned: 'nl',
  germany: 'de',
  ger: 'de',
  deutschland: 'de',
  spain: 'es',
  esp: 'es',
  france: 'fr',
  fra: 'fr',
  italy: 'it',
  ita: 'it',
  portugal: 'pt',
  por: 'pt',
  belgium: 'be',
  austria: 'at',
  switzerland: 'ch',
  denmark: 'dk',
  sweden: 'se',
  norway: 'no',
  finland: 'fi',
  poland: 'pl',
  czech: 'cz',
  'czech republic': 'cz',
  hungary: 'hu',
  greece: 'gr',
  turkey: 'tr',
  romania: 'ro',
  usa: 'us',
  'united states': 'us',
  'united states of america': 'us',
  america: 'us',
  canada: 'ca',
  mexico: 'mx',
  brazil: 'br',
  argentina: 'ar',
  chile: 'cl',
  colombia: 'co',
  japan: 'jp',
  china: 'cn',
  'hong kong': 'hk',
  'south korea': 'kr',
  korea: 'kr',
  malaysia: 'my',
  singapore: 'sg',
  thailand: 'th',
  indonesia: 'id',
  philippines: 'ph',
  vietnam: 'vn',
  kenya: 'ke',
  uganda: 'ug',
  tanzania: 'tz',
  rwanda: 'rw',
  nigeria: 'ng',
  ghana: 'gh',
  egypt: 'eg',
  morocco: 'ma',
  tunisia: 'tn',
  botswana: 'bw',
  'papua new guinea': 'pg',
  png: 'pg',
  fiji: 'fj',
  samoa: 'ws',
  'isle of man': 'im',
  jersey: 'je',
  guernsey: 'gg',
  bermuda: 'bm',
  'cayman islands': 'ky',
  bahrain: 'bh',
  qatar: 'qa',
  kuwait: 'kw',
  'saudi arabia': 'sa',
  'west indies': 'wi',
  windies: 'wi',
  wi: 'wi',
  caribbean: 'wi',
};

/**
 * Club / city tokens → country flag.
 * Longer tokens are matched first so "sri lanka" is not stolen by "lanka" clubs.
 */
const CLUB_HINTS = [
  // India / IPL / domestic
  ['mumbai', 'in'], ['chennai', 'in'], ['delhi', 'in'], ['kolkata', 'in'],
  ['hyderabad', 'in'], ['bengaluru', 'in'], ['bangalore', 'in'], ['lucknow', 'in'],
  ['ahmedabad', 'in'], ['jaipur', 'in'], ['punjab', 'in'], ['gujarat', 'in'],
  ['rajasthan', 'in'],   ['sunrisers', 'in'], ['super kings', 'in'],
  ['kolkata knight riders', 'in'], ['royal challengers', 'in'],
  ['delhi capitals', 'in'], ['gujarat titans', 'in'], ['lucknow super giants', 'in'],
  ['mumbai indians', 'in'], ['punjab kings', 'in'], ['rajasthan royals', 'in'],
  ['tamil nadu', 'in'], ['karnataka', 'in'],
  ['outer delhi', 'in'], ['madurai', 'in'],
  // Pakistan
  ['karachi', 'pk'], ['lahore', 'pk'], ['islamabad', 'pk'], ['peshawar', 'pk'],
  ['multan', 'pk'], ['quetta', 'pk'],
  // Australia
  ['sydney', 'au'], ['melbourne', 'au'], ['brisbane', 'au'], ['perth', 'au'],
  ['adelaide', 'au'], ['hobart', 'au'],   ['sydney sixers', 'au'], ['sydney thunder', 'au'], ['brisbane heat', 'au'],
  ['adelaide strikers', 'au'], ['hobart hurricanes', 'au'], ['perth scorchers', 'au'],
  ['melbourne renegades', 'au'], ['melbourne stars', 'au'],
  // England counties / The Hundred / EPL
  ['hampshire', 'gb-eng'], ['surrey', 'gb-eng'], ['yorkshire', 'gb-eng'],
  ['lancashire', 'gb-eng'], ['nottingham', 'gb-eng'], ['warwickshire', 'gb-eng'],
  ['essex', 'gb-eng'], ['kent', 'gb-eng'], ['sussex', 'gb-eng'],
  ['somerset', 'gb-eng'], ['derbyshire', 'gb-eng'], ['durham', 'gb-eng'],
  ['worcester', 'gb-eng'], ['leicester', 'gb-eng'], ['northampton', 'gb-eng'],
  ['middlesex', 'gb-eng'], ['gloucester', 'gb-eng'],
  ['manchester', 'gb-eng'], ['liverpool', 'gb-eng'], ['chelsea', 'gb-eng'],
  ['arsenal', 'gb-eng'], ['tottenham', 'gb-eng'], ['newcastle', 'gb-eng'],
  ['aston villa', 'gb-eng'], ['west ham', 'gb-eng'], ['brighton', 'gb-eng'],
  ['oval invincibles', 'gb-eng'], ['trent rockets', 'gb-eng'],
  ['london spirit', 'gb-eng'], ['manchester originals', 'gb-eng'],
  ['birmingham phoenix', 'gb-eng'], ['northern superchargers', 'gb-eng'],
  ['welsh fire', 'gb-wls'], ['glamorgan', 'gb-wls'], ['cardiff', 'gb-wls'],
  ['southern brave', 'gb-eng'],
  // Germany / Frankfurt T10
  ['erfelden', 'de'], ['wiesbaden', 'de'], ['darmstadt', 'de'],
  ['frankfurt', 'de'], ['berlin', 'de'], ['munich', 'de'], ['münchen', 'de'],
  ['hamburg', 'de'], ['cologne', 'de'], ['köln', 'de'], ['stuttgart', 'de'],
  ['dortmund', 'de'], ['bayern', 'de'], ['leipzig', 'de'],
  // Sri Lanka
  ['colombo', 'lk'], ['kandy', 'lk'], ['galle', 'lk'], ['dambulla', 'lk'], ['jaffna', 'lk'],
  // West Indies / CPL
  ['barbados', 'wi'], ['jamaica', 'wi'], ['trinidad', 'wi'], ['guyana', 'wi'],
  ['st lucia', 'wi'], ['saint lucia', 'wi'], ['antigua', 'wi'],
  ['trinbago', 'wi'], ['guyana amazon', 'wi'], ['jamaica tallawahs', 'wi'],
  // Spain / Italy / France football
  ['madrid', 'es'], ['barcelona', 'es'], ['sevilla', 'es'], ['valencia', 'es'],
  ['atletico', 'es'], ['juventus', 'it'], ['inter', 'it'], ['milan', 'it'],
  ['napoli', 'it'], ['roma', 'it'], ['psg', 'fr'], ['paris', 'fr'],
  ['marseille', 'fr'], ['lyon', 'fr'],
  // NBA / NFL
  ['lakers', 'us'], ['celtics', 'us'], ['warriors', 'us'], ['knicks', 'us'],
  ['bulls', 'us'], ['heat', 'us'], ['nets', 'us'], ['mavericks', 'us'],
  ['patriots', 'us'], ['cowboys', 'us'], ['chiefs', 'us'], ['eagles', 'us'],
];

const COUNTRY_PHRASES = Object.keys(COUNTRY_ALIASES).sort((a, b) => b.length - a.length);
const CLUB_HINTS_SORTED = [...CLUB_HINTS].sort((a, b) => b[0].length - a[0].length);

export function normalizeTeamFlagLabel(team) {
  const raw = typeof team === 'string'
    ? team
    : (team?.name || team?.shortName || team?.teamName || '');
  return String(raw)
    .toLowerCase()
    .replace(/oddsyra\s*srl/g, ' ')
    .replace(/betking\s*srl/g, ' ')
    .replace(/\bsrl\b/g, ' ')
    .replace(/\(v\)|\(virtual\)|\(women\)|\(men\)|\bwomen\b|\bmen\b|\bu-?19\b|\bu-?23\b/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function codeFromCountryField(value) {
  if (!value) return null;
  const key = String(value).toLowerCase().trim();
  if (COUNTRY_ALIASES[key]) return COUNTRY_ALIASES[key];
  if (/^[a-z]{2}$/i.test(key) || /^gb-(eng|sct|wls|nir)$/i.test(key)) {
    return key.toLowerCase();
  }
  return null;
}

export function resolveTeamFlagCode(team) {
  if (!team) return null;

  if (typeof team === 'object') {
    const explicit = codeFromCountryField(
      team.flagCode || team.isoCode || team.countryCode || team.country,
    );
    if (explicit) return explicit;
  }

  const label = normalizeTeamFlagLabel(team);
  if (!label) return null;

  if (COUNTRY_ALIASES[label]) return COUNTRY_ALIASES[label];

  for (const phrase of COUNTRY_PHRASES) {
    if (phrase.length < 3) continue;
    const re = new RegExp(`(?:^|\\s)${phrase}(?:\\s|$)`);
    if (re.test(label)) return COUNTRY_ALIASES[phrase];
  }

  for (const [hint, code] of CLUB_HINTS_SORTED) {
    if (label.includes(hint)) return code;
  }

  const short = typeof team === 'object' ? String(team.shortName || '').toLowerCase() : '';
  if (short && COUNTRY_ALIASES[short]) return COUNTRY_ALIASES[short];

  return null;
}

export function flagImageUrl(code) {
  if (!code || code === 'wi') return null;
  return `${FLAG_CDN}/${code}.svg`;
}

/** National sides only — franchise / SRL / county clubs get kit pennants instead. */
export function isNationalTeam(team) {
  const label = normalizeTeamFlagLabel(team);
  if (!label) return false;
  if (/\bsrl\b/.test(label) || label.includes('oddsyra')) return false;
  if (COUNTRY_ALIASES[label]) return true;

  for (const phrase of COUNTRY_PHRASES) {
    if (phrase.length < 3) continue;
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`^${escaped}(?:\\s+(?:a|b|xi|plus|lions))?$`).test(label)) {
      return true;
    }
  }
  return false;
}

export function resolveTeamMark(team) {
  const label = typeof team === 'string' ? team : (team?.name || team?.shortName || 'Team');
  const initials = formatTeamShortName(
    normalizeTeamFlagLabel(team) || label,
    typeof team === 'object' ? team?.shortName : '',
  );

  if (isNationalTeam(team)) {
    const code = resolveTeamFlagCode(team);
    return {
      kind: code === 'wi' ? 'wi' : 'flag',
      code,
      src: flagImageUrl(code),
      label,
      initials,
    };
  }

  return {
    kind: 'kit',
    label,
    initials,
  };
}

export function resolveTeamFlag(team) {
  return resolveTeamMark(team);
}

export function isTeamBattingInMatch(match, team) {
  const sport = String(match?.sport || '').toLowerCase();
  if (sport !== 'cricket' && sport !== 'virtual-cricket') return false;
  if (!(match?.isLive || match?.matchState === 'in' || match?.liveStatus === 'LIVE')) {
    return false;
  }

  const teamName = typeof team === 'string' ? team : (team?.name || '');
  if (!teamName) return false;

  const ld = match.liveDetails || {};
  const t1 = match.team1?.name || match.team1 || '';
  const isTeam1 = teamNameMatches(t1, teamName) || team === match.team1;

  if (ld.chaseTeamName && teamNameMatches(teamName, ld.chaseTeamName)) return true;
  if (ld.firstTeamName) {
    const thisBattedFirst = teamNameMatches(teamName, ld.firstTeamName);
    return isCricketSecondInnings(match, ld) ? !thisBattedFirst : thisBattedFirst;
  }

  return isCricketSecondInnings(match, ld) ? !isTeam1 : isTeam1;
}
