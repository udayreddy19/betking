import { formatTeamShortName } from '../../src/utils/teamShortName.js';

export function decodeHtmlEntities(text = '') {
  return String(text)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&middot;/gi, '·')
    .replace(/&mdash;|&ndash;/gi, '—')
    .replace(/&#39;|&s;/g, "'")
    .replace(/&q;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

export function stripTags(html = '') {
  return decodeHtmlEntities(String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

export function parseCricketScoreText(text = '') {
  const raw = decodeHtmlEntities(String(text || '')).replace(/,/g, '').trim();
  if (!raw || raw === '—' || raw === '-' || /^yet to bat$/i.test(raw)) {
    return { runs: 0, wickets: 0, raw };
  }
  const hit = raw.match(/(\d+)\s*[-\/]\s*(\d+)/);
  if (hit) return { runs: Number(hit[1]), wickets: Number(hit[2]), raw };
  const runsOnly = raw.match(/^(\d+)\s*$/);
  if (runsOnly) return { runs: Number(runsOnly[1]), wickets: 0, raw };
  return { runs: 0, wickets: 0, raw };
}

export function parseOversText(text = '') {
  const raw = decodeHtmlEntities(String(text || '')).trim();
  const hit = raw.match(/\(?(\d+(?:\.\d+)?)\)?/);
  if (hit && !/yet to bat/i.test(raw)) return hit[1];
  return '';
}

export function cricketStatusFromText({ live = false, comment = '', completedHint = false } = {}) {
  const note = String(comment || '');
  const finished = completedHint
    || /\bwon by\b|\bwin by\b|\bmatch drawn\b|\bno result\b|\babandoned\b|\bcompleted\b/i.test(note);
  if (live && !finished) {
    return { isLive: true, isCompleted: false, matchState: 'in', status: 'LIVE', time: 'Live' };
  }
  if (finished) {
    return { isLive: false, isCompleted: true, matchState: 'post', status: 'COMPLETED', time: 'Completed' };
  }
  return { isLive: false, isCompleted: false, matchState: 'pre', status: 'SCHEDULED', time: 'Scheduled' };
}

export function winnerSideFromComment(comment, team1, team2) {
  const note = String(comment || '');
  const won = note.match(/^(.+?)\s+won\b/i);
  if (!won) return null;
  const winner = won[1].trim().toLowerCase();
  const n1 = String(team1 || '').toLowerCase();
  const n2 = String(team2 || '').toLowerCase();
  if (n1 && (winner.includes(n1) || n1.includes(winner))) return '1';
  if (n2 && (winner.includes(n2) || n2.includes(winner))) return '2';
  return null;
}

export function teamBlock(name, shortName, color = '#22c55e') {
  const full = decodeHtmlEntities(String(name || '').trim());
  return {
    name: full,
    shortName: shortName || formatTeamShortName(full),
    color,
  };
}
