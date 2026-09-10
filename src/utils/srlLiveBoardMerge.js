import { oversToBalls } from './oversUtils.js';

function isChaseLive(ld = {}) {
  return Number(ld.inningsId) === 2
    || ld.phase === 'chase'
    || ld.phase === 'chase-complete';
}

export function srlInningsBalls(ld = {}) {
  const overs = isChaseLive(ld)
    ? (ld.chaseOvers ?? ld.overs2 ?? ld.overs)
    : (ld.firstOvers ?? ld.overs);
  return oversToBalls(overs || '0.0');
}

export function srlInningsRuns(ld = {}) {
  return Number(
    isChaseLive(ld)
      ? (ld.chaseRuns ?? ld.score2 ?? ld.runs ?? 0)
      : (ld.firstRuns ?? ld.runs ?? 0),
  ) || 0;
}

export function isSrlDeskDriven(match) {
  const op = match?.operator || {};
  if (op.started || op.paused || op.forcedWinnerKey || op.declaredWinnerKey) return true;
  if (Array.isArray(op.scoreAnchors) && op.scoreAnchors.length > 0) return true;
  if (op.customCommentary || op.rainDelay) return true;
  return false;
}

/**
 * Client `getIplSrlMatches()` has no PG operator session, so My Bets / sports list
 * lag the live match widget (server seeks/anchors). Prefer the server board when
 * the desk has driven play or the boards already diverge.
 */
export function overlaySrlFromServer(client, server) {
  if (!client) return server || null;
  if (!server) return client;

  const sLd = server.liveDetails;
  if (!sLd) {
    return {
      ...client,
      operator: server.operator || client.operator,
      bettingClosed: server.bettingClosed ?? client.bettingClosed,
    };
  }

  const cLd = client.liveDetails || {};
  const desk = isSrlDeskDriven(server);
  const ballsDelta = Math.abs(srlInningsBalls(sLd) - srlInningsBalls(cLd));
  const runsDelta = Math.abs(srlInningsRuns(sLd) - srlInningsRuns(cLd));

  // Natural wall-clock: keep the 2s client tick for smoothness.
  if (!desk && ballsDelta < 1 && runsDelta < 2) {
    return {
      ...client,
      operator: server.operator || client.operator,
      bettingClosed: server.bettingClosed ?? client.bettingClosed,
    };
  }

  return {
    ...client,
    matchState: server.matchState ?? client.matchState,
    isLive: server.isLive ?? client.isLive,
    time: server.time ?? client.time,
    bettingClosed: server.bettingClosed ?? client.bettingClosed,
    operator: server.operator || client.operator,
    liveDetails: { ...cLd, ...sLd },
    scorecardInnings: (Array.isArray(server.scorecardInnings) && server.scorecardInnings.length
      ? server.scorecardInnings
      : null)
      || sLd.scorecardInnings
      || client.scorecardInnings,
    squads: (Array.isArray(server.squads) && server.squads.length) ? server.squads : client.squads,
    toss: server.toss || client.toss,
  };
}
