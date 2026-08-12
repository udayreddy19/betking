/**
 * Server-Authoritative Market Evaluation & Determination Engine (lib/marketEvaluationEngine.mjs)
 * Evaluates betting markets dynamically against current live match state.
 * Determines whether a market or selection is OPEN, SUSPENDED, or DETERMINED (WON/LOST/CLOSED).
 */

export function parseMarketLine(selectionOrMarketName = '') {
  const match = String(selectionOrMarketName).match(/(?:Over|Under|Spread|Total|Goals|Runs)\s+([+-]?\d+(?:\.\d+)?)/i);
  if (match) return parseFloat(match[1]);
  const numMatch = String(selectionOrMarketName).match(/([+-]?\d+\.5)/);
  if (numMatch) return parseFloat(numMatch[1]);
  return null;
}

export function evaluateMarketAgainstMatchState(market = {}, matchState = {}) {
  const marketType = market.marketType || market.key || market.id || '';
  const marketTitle = String(market.title || market.name || '').toLowerCase();
  const status = market.status || 'OPEN';

  if (status === 'CLOSED' || status === 'SETTLED' || status === 'CANCELLED') {
    return {
      status,
      determined: true,
      reason: `Market status is explicitly ${status}`,
      options: (market.options || market.selections || []).map(opt => ({
        ...opt,
        status: 'DETERMINED',
        bettable: false,
      })),
    };
  }

  // Extract score info
  const ld = matchState.liveDetails || matchState.live || {};
  const team1Name = String(matchState.teams?.team1?.name || '').toLowerCase();
  const team2Name = String(matchState.teams?.team2?.name || '').toLowerCase();

  const team1Runs = matchState.teams?.team1?.runs ?? ld.runs ?? matchState.runs ?? 0;
  const team2Runs = matchState.teams?.team2?.runs ?? ld.score2 ?? matchState.score2 ?? 0;
  const totalMatchRuns = team1Runs + team2Runs;

  const currentInningsNum = matchState.currentInnings?.number ?? (ld.inningsId ? parseInt(ld.inningsId, 10) : 1);
  const isSecondInnings = currentInningsNum >= 2 || Boolean(ld.chaseTeamName || ld.chaseRuns != null || ld.score2 > 0);
  const isMatchFinished = matchState.status === 'COMPLETED' || matchState.status === 'FINISHED' || matchState.matchState === 'post';

  const target = matchState.chaseState?.target || ld.target || (team1Runs > 0 ? team1Runs + 1 : null);

  // 1. First Innings Specific Markets (Historical / Determined when in Innings 2)
  const is1stInningsMarket = marketTitle.includes('1st innings')
    || marketType.includes('powerplay_total')
    || marketType.includes('first_over')
    || marketType.includes('over10')
    || marketType.includes('partnership');

  if (is1stInningsMarket && (isSecondInnings || isMatchFinished || currentInningsNum > 1)) {
    return {
      status: 'DETERMINED',
      determined: true,
      reason: '1st Innings has completed',
      options: (market.options || market.selections || []).map(opt => ({
        ...opt,
        status: 'DETERMINED',
        bettable: false,
        determined: true,
        resultReason: '1st Innings is finished',
      })),
    };
  }

  // Evaluate options/selections
  const rawOptions = market.options || market.selections || [];

  const evaluatedOptions = rawOptions.map((opt) => {
    const selName = opt.name || opt.selection || '';
    const line = opt.line ?? parseMarketLine(selName) ?? market.line;
    const isOver = /over/i.test(selName) || String(opt.selection).toLowerCase().includes('over');
    const isUnder = /under/i.test(selName) || String(opt.selection).toLowerCase().includes('under');

    // 2. Team 1 Total Runs (e.g. Australia Total Runs line 165.5)
    if (marketType === 'team1_runs' || (marketTitle.includes('total runs') && team1Name && marketTitle.includes(team1Name))) {
      const team1InningsComplete = isSecondInnings || isMatchFinished || currentInningsNum > 1;

      if (line != null) {
        if (team1Runs > line) {
          // Current score exceeds line -> Over WON, Under LOST
          return {
            ...opt,
            status: 'DETERMINED',
            bettable: false,
            determined: true,
            won: isOver,
            resultReason: `Team 1 runs ${team1Runs} > line ${line}`,
          };
        } else if (team1InningsComplete) {
          // Team 1 innings finished and score <= line -> Under WON, Over LOST
          return {
            ...opt,
            status: 'DETERMINED',
            bettable: false,
            determined: true,
            won: isUnder,
            resultReason: `Team 1 innings ended at ${team1Runs} <= line ${line}`,
          };
        }
      }
    }

    // 3. Team 2 Total Runs (e.g. South Africa Total Runs line 175.5 or 155.5)
    if (marketType === 'team2_runs' || (marketTitle.includes('total runs') && team2Name && marketTitle.includes(team2Name))) {
      const team2InningsComplete = isMatchFinished || currentInningsNum > 2;

      if (line != null) {
        if (team2Runs > line) {
          // Current score exceeds line -> Over WON, Under LOST
          return {
            ...opt,
            status: 'DETERMINED',
            bettable: false,
            determined: true,
            won: isOver,
            resultReason: `Team 2 runs ${team2Runs} > line ${line}`,
          };
        } else if (team2InningsComplete) {
          // Team 2 innings finished and score <= line -> Under WON, Over LOST
          return {
            ...opt,
            status: 'DETERMINED',
            bettable: false,
            determined: true,
            won: isUnder,
            resultReason: `Team 2 innings ended at ${team2Runs} <= line ${line}`,
          };
        } else if (isSecondInnings && target != null) {
          // Team 2 is chasing with target T
          if (line >= target) {
            // Line >= Target: Over is impossible because match ends at target! Under WON.
            return {
              ...opt,
              status: 'DETERMINED',
              bettable: false,
              determined: true,
              won: isUnder,
              resultReason: `Line ${line} >= target ${target}. Over is impossible as innings ends at target`,
            };
          }
        }
      }
    }

    // 4. Total Match Runs (e.g. Total Match Runs line 298.5)
    if (marketType === 'match_total_runs' || marketTitle.includes('total match runs') || marketTitle.includes('match total runs')) {
      if (line != null) {
        if (totalMatchRuns > line) {
          return {
            ...opt,
            status: 'DETERMINED',
            bettable: false,
            determined: true,
            won: isOver,
            resultReason: `Total match runs ${totalMatchRuns} > line ${line}`,
          };
        } else if (isMatchFinished) {
          return {
            ...opt,
            status: 'DETERMINED',
            bettable: false,
            determined: true,
            won: isUnder,
            resultReason: `Match completed at ${totalMatchRuns} <= line ${line}`,
          };
        }
      }
    }

    // Default: OPEN if not determined
    return {
      ...opt,
      status: opt.status || 'OPEN',
      bettable: (opt.status || 'OPEN') === 'OPEN',
      determined: false,
    };
  });

  const allOptDetermined = evaluatedOptions.every(o => o.determined);
  const anyOptDetermined = evaluatedOptions.some(o => o.determined);
  const finalStatus = (allOptDetermined || anyOptDetermined) ? 'DETERMINED' : status;

  return {
    status: finalStatus,
    determined: finalStatus === 'DETERMINED',
    options: evaluatedOptions,
  };
}
