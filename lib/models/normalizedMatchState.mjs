/**
 * Normalized Match State Model (lib/models/normalizedMatchState.mjs)
 * Canonical, sport-aware match state representation for BetKing Sportsbook.
 * Encapsulates live score, innings details, overs, wickets, target, rates, format rules, and state versioning.
 */

import { CricketFormatRules } from '../engines/cricketFormatRules.mjs';

export class NormalizedMatchState {
  constructor(data = {}) {
    this.matchId = data.matchId || data.id || `match_${Date.now()}`;
    this.sport = String(data.sport || 'CRICKET').toUpperCase();
    this.competition = data.competition || data.seriesName || data.league || data.tournament || 'General';
    this.matchFormat = String(data.matchFormat || data.format || 'T20').toUpperCase();

    // Resolve format rules (T20, ODI, TEST, THE_HUNDRED, T10)
    this.formatRules = CricketFormatRules.getFormatRules(this.matchFormat, this.competition);

    this.status = data.status || (data.isLive || data.matchState === 'in' ? 'LIVE' : 'PRE_MATCH');
    this.stateVersion = data.stateVersion || 1;
    this.startTime = data.startTime || data.matchDate || null;
    this.lastEvent = data.lastEvent || null;
    this.lastEventTimestamp = data.lastEventTimestamp || Date.now();
    this.providerTimestamp = data.providerTimestamp || new Date().toISOString();

    // Teams
    this.teams = {
      team1: {
        id: data.team1?.id || 't1',
        name: data.team1?.name || data.team1?.shortName || 'Team 1',
        runs: data.teams?.team1?.runs ?? data.team1?.runs ?? data.liveDetails?.runs ?? data.runs ?? 0,
        wickets: data.teams?.team1?.wickets ?? data.team1?.wickets ?? data.liveDetails?.wickets ?? data.wickets ?? 0,
        overs: String(data.teams?.team1?.overs ?? data.team1?.overs ?? data.liveDetails?.overs ?? data.overs ?? '0.0'),
      },
      team2: {
        id: data.team2?.id || 't2',
        name: data.team2?.name || data.team2?.shortName || 'Team 2',
        runs: data.teams?.team2?.runs ?? data.team2?.runs ?? data.liveDetails?.score2 ?? data.score2 ?? 0,
        wickets: data.teams?.team2?.wickets ?? data.team2?.wickets ?? data.liveDetails?.wickets2 ?? data.wickets2 ?? 0,
        overs: String(data.teams?.team2?.overs ?? data.team2?.overs ?? data.liveDetails?.overs2 ?? data.overs2 ?? '0.0'),
      },
    };

    // Cricket Innings & Chase State - Authoritative Resolution
    const ld = data.liveDetails || {};
    const rawInnings = data.currentInnings?.number ?? (ld.inningsId ? parseInt(ld.inningsId, 10) : null);

    // If team2 has runs or target is present, currentInnings MUST be 2!
    if (rawInnings != null) {
      this.currentInnings = rawInnings;
    } else if (this.teams.team2.runs > 0 || ld.target != null || ld.score2 > 0 || ld.runsRequired != null) {
      this.currentInnings = 2;
    } else {
      this.currentInnings = 1;
    }

    // Double check override: if team2 has runs > 0, currentInnings cannot be 1
    if (this.teams.team2.runs > 0 && this.currentInnings === 1) {
      this.currentInnings = 2;
    }

    this.battingTeam = data.battingTeam || (this.currentInnings === 2 ? this.teams.team2.name : this.teams.team1.name);
    this.bowlingTeam = data.bowlingTeam || (this.currentInnings === 2 ? this.teams.team1.name : this.teams.team2.name);

    this.target = data.target ?? ld.target ?? (this.currentInnings === 2 && this.teams.team1.runs > 0 ? this.teams.team1.runs + 1 : null);

    // Ball calculations per format rules
    const ballsPerOver = this.formatRules.ballsPerOver || 6;
    const maxBallsForFormat = this.formatRules.maxBalls || 120;

    const currentOversStr = this.currentInnings === 2 ? this.teams.team2.overs : this.teams.team1.overs;
    const oversNum = parseFloat(currentOversStr || '0.0');
    const completedOvers = Math.floor(oversNum);
    const ballsInOver = Math.round((oversNum - completedOvers) * 10);

    this.ballsCompleted = completedOvers * ballsPerOver + ballsInOver;
    this.ballsRemaining = Math.max(0, maxBallsForFormat - this.ballsCompleted);

    const currentTeamRuns = this.currentInnings === 2 ? this.teams.team2.runs : this.teams.team1.runs;
    this.runsRequired = (this.currentInnings === 2 && this.target != null) ? Math.max(0, this.target - currentTeamRuns) : null;

    const totalOversBowled = this.ballsCompleted / ballsPerOver;
    this.runRate = totalOversBowled > 0 ? Number((currentTeamRuns / totalOversBowled).toFixed(2)) : 0;
    this.requiredRunRate = (this.runsRequired != null && this.ballsRemaining > 0) ? Number((this.runsRequired / (this.ballsRemaining / ballsPerOver)).toFixed(2)) : null;
  }

  isLive() {
    return this.status === 'LIVE' || this.status === 'IN_PROGRESS';
  }

  isMatchFinished() {
    return this.status === 'COMPLETED' || this.status === 'FINISHED' || this.status === 'ENDED';
  }
}
