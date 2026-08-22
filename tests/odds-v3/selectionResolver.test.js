import { describe, it, expect } from 'vitest';
import {
  resolveSelectionInPool,
  resolveSideSelection,
  canonicalTeamsFromSnapshot,
  createSelectionUnresolvedError,
} from '../../lib/odds-v3/selectionResolver.mjs';
import { findQuotedSelection } from '../../lib/odds-v3/bookIntegrity.mjs';

const teamA = { id: 't_a', name: 'Oval Invincibles', shortName: 'OVI' };
const teamB = { id: 't_b', name: 'Trent Rockets', shortName: 'TRT' };

describe('selectionResolver — canonical identity (AUD-012)', () => {
  it('Provider A: selectionId 1/2 map to team names; never array position', () => {
    const poolA = [
      { selectionId: '1', name: 'Oval Invincibles', odds: 1.9 },
      { selectionId: '2', name: 'Trent Rockets', odds: 2.1 },
    ];
    const snap = { team1: teamA, team2: teamB, homeTeam: teamA, awayTeam: teamB };
    const teams = canonicalTeamsFromSnapshot(snap);

    expect(resolveSelectionInPool(poolA, 'home', { teams })?.name).toBe('Oval Invincibles');
    expect(resolveSelectionInPool(poolA, 'away', { teams })?.name).toBe('Trent Rockets');
  });

  it('Provider B: reversed ordering — 1=Team B, 2=Team A; HOME still Team A', () => {
    const poolB = [
      { selectionId: '1', name: 'Trent Rockets', odds: 2.1 },
      { selectionId: '2', name: 'Oval Invincibles', odds: 1.9 },
    ];
    const snap = { team1: teamA, team2: teamB, homeTeam: teamA, awayTeam: teamB };
    const teams = canonicalTeamsFromSnapshot(snap);

    expect(resolveSideSelection(poolB, 'home', teams)?.name).toBe('Oval Invincibles');
    expect(resolveSideSelection(poolB, 'away', teams)?.name).toBe('Trent Rockets');
    expect(resolveSelectionInPool(poolB, '1', { teams })?.name).toBe('Trent Rockets');
    expect(resolveSelectionInPool(poolB, '2', { teams })?.name).toBe('Oval Invincibles');
    expect(resolveSelectionInPool(poolB, 'home', { teams })?.name).toBe('Oval Invincibles');
  });

  it('throws SELECTION_UNRESOLVED when identity is ambiguous or missing', () => {
    const pool = [
      { selectionId: '1', name: 'Unknown XI', odds: 1.5 },
      { selectionId: '2', name: 'Other XI', odds: 2.5 },
    ];
    const snap = { team1: teamA, team2: teamB };
    const teams = canonicalTeamsFromSnapshot(snap);
    expect(resolveSelectionInPool(pool, 'home', { teams })).toBeNull();

    const snapshot = {
      markets: [{
        marketId: 'match_winner',
        status: 'OPEN',
        selections: pool,
      }],
      team1: teamA,
      team2: teamB,
    };
    expect(() => findQuotedSelection(snapshot, 'match_winner', 'home')).toThrow(/SELECTION_UNRESOLVED/);
    const err = createSelectionUnresolvedError('home', 'match_winner');
    expect(err.code).toBe('SELECTION_UNRESOLVED');
  });

  it('resolves team name aliases and provider ids', () => {
    const pool = [
      { selectionId: 'w_home', name: 'OVI', odds: 1.85, canonicalSide: 'HOME' },
      { selectionId: 'w_away', name: 'TRT', odds: 2.05, canonicalSide: 'AWAY' },
    ];
    const snap = { team1: teamA, team2: teamB };
    const teams = canonicalTeamsFromSnapshot(snap);
    expect(resolveSelectionInPool(pool, 'OVI', { teams })?.selectionId).toBe('w_home');
    expect(resolveSelectionInPool(pool, 'Trent Rockets', { teams })?.selectionId).toBe('w_away');
  });

  it('duplicate selections with same id returns null (unresolved)', () => {
    const pool = [
      { selectionId: '1', name: 'Oval Invincibles', odds: 1.9 },
      { selectionId: '1', name: 'Oval Invincibles', odds: 1.95 },
    ];
    const snap = { team1: teamA, team2: teamB };
    expect(resolveSelectionInPool(pool, '1', { teams: canonicalTeamsFromSnapshot(snap) })).toBeNull();
  });
});
