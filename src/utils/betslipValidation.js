const RELATED_MSG = 'Some of the selections are related and cannot be combined.';

function norm(text = '') {
  return String(text).trim().toLowerCase();
}

function marketKey(bet) {
  const id = norm(bet.marketId || bet.marketName || '');
  const name = norm(bet.marketName || '');
  const over = name.match(/over\s+(\d+)/i)?.[1]
    || id.match(/over[_-]?(\d+)/i)?.[1];
  if (over) return `${bet.matchId}|over:${over}`;
  if (/odd.?even|odd_even/i.test(id) || /odd.?even/i.test(name)) {
    const m = name.match(/over\s+(\d+)/i) || id.match(/over[_-]?(\d+)/i);
    return `${bet.matchId}|oddeven:${m?.[1] || 'x'}`;
  }
  if (/match_winner|winner/i.test(id) || /winner/i.test(name)) {
    return `${bet.matchId}|winner`;
  }
  if (bet.marketId) return `${bet.matchId}|${bet.marketId}`;
  return `${bet.matchId}|${name.slice(0, 48)}`;
}

function isOdd(name) {
  const s = norm(name);
  return /\bodd\b/.test(s) && !/\beven\b/.test(s);
}

function isEven(name) {
  return /\beven\b/.test(norm(name));
}

function isOver(name) {
  const s = norm(name);
  return /\bover\b/.test(s) && !/\bunder\b/.test(s);
}

function isUnder(name) {
  return /\bunder\b/.test(norm(name));
}

function parseLine(bet) {
  const src = `${bet.selectionName || ''} ${bet.selection || ''} ${bet.marketName || ''}`;
  const m = src.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

function conflictReason(a, b) {
  if (a.matchId !== b.matchId) return null;

  const keyA = marketKey(a);
  const keyB = marketKey(b);

  if (keyA === keyB) {
    if ((isOdd(a.selectionName) && isEven(b.selectionName))
      || (isEven(a.selectionName) && isOdd(b.selectionName))) {
      return RELATED_MSG;
    }
    if ((isOver(a.selectionName) && isUnder(b.selectionName))
      || (isUnder(a.selectionName) && isOver(b.selectionName))) {
      const lineA = parseLine(a);
      const lineB = parseLine(b);
      if (lineA == null || lineB == null || Math.abs(lineA - lineB) < 0.01) {
        return RELATED_MSG;
      }
    }
    if (/winner/i.test(keyA) && a.selection !== b.selection) {
      return RELATED_MSG;
    }
    if (a.marketId && a.marketId === b.marketId && a.selection !== b.selection) {
      return RELATED_MSG;
    }
  }

  return null;
}

/** Map betId → { message, relatedIds[] } for multi-bet conflicts */
export function analyzeMultiConflicts(bets = []) {
  const map = new Map();
  const mark = (id, otherId, message) => {
    const prev = map.get(id) || { message, relatedIds: [] };
    if (!prev.relatedIds.includes(otherId)) prev.relatedIds.push(otherId);
    map.set(id, prev);
  };

  for (let i = 0; i < bets.length; i += 1) {
    for (let j = i + 1; j < bets.length; j += 1) {
      const reason = conflictReason(bets[i], bets[j]);
      if (reason) {
        mark(bets[i].id, bets[j].id, reason);
        mark(bets[j].id, bets[i].id, reason);
      }
    }
  }
  return map;
}

export function hasMultiConflicts(bets = []) {
  return analyzeMultiConflicts(bets).size > 0;
}
