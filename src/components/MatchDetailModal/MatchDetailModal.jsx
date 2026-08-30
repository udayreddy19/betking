import { useState, useEffect, useMemo } from 'react';
import { IoClose } from '../../icons';
import { useBetSlip } from '../../context/BetSlipContext';
import { isMatchBettable, isMatchLive } from '../../utils/matchBetting';
import {
  fetchAuthoritativeMatchOdds,
  getCachedMatchOdds,
  matchOddsStateKey,
  provisionalWinnerMarketsFromMatch,
} from '../../services/oddsService';
import { subscribeLiveChannel } from '../../services/liveFeedSocket';
import { resolveCricketTeamScores, isCricketSecondInnings, resolveCricketTossText } from '../../utils/cricketScores';
import { isTeamBattingInMatch } from '../../utils/teamFlags';
import { getChaseText } from '../../utils/liveMatchWidgetData';
import { getMatchMaxOvers, isTestMatch, getTestMatchDayLabel, formatMatchCountdown } from '../../utils/cricketFormat';
import { displayPlayerName } from '../../utils/cricketPlayers';
import { getRosterForTeam } from '../../data/cricketRosters';
import BetSlipFooter from '../BetSlip/BetSlipFooter';
import TeamJersey from '../TeamJersey/TeamJersey';
import MatchCountdownTimer from '../MatchCountdownTimer/MatchCountdownTimer';
import LiveChartsWidget from '../LiveChartsWidget/LiveChartsWidget';
import './MatchDetailModal.css';

export default function MatchDetailModal({ match, isOpen, onClose }) {
  const { addBet, isBetSelected, betCount } = useBetSlip();
  const [activeMarketCategory, setActiveMarketCategory] = useState('all');
  const [builderLegs, setBuilderLegs] = useState([]);

  const toggleBuilderLeg = (label, odds) => {
    setBuilderLegs(prev => {
      const exists = prev.find(l => l.label === label);
      if (exists) return prev.filter(l => l.label !== label);
      if (prev.length >= 4) return prev;
      return [...prev, { label, odds: Number(odds) }];
    });
  };

  const builderCombinedOdds = useMemo(() => {
    if (!builderLegs.length) return 1.0;
    const product = builderLegs.reduce((acc, leg) => acc * leg.odds, 1);
    // Slight correlation discount factor for same match
    const discount = builderLegs.length > 1 ? 0.92 : 1.0;
    return Math.max(1.10, Math.round(product * discount * 100) / 100);
  }, [builderLegs]);

  const [matchMarkets, setMatchMarkets] = useState([]);
  const oddsStateKey = matchOddsStateKey(match);
  const team1Name = match?.team1?.name;
  const team2Name = match?.team2?.name;

  useEffect(() => {
    if (!isOpen) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || (!match?.id && !match?.matchId)) {
      setMatchMarkets([]);
      return undefined;
    }
    const matchId = match.id || match.matchId;

    const cached = getCachedMatchOdds(matchId, oddsStateKey);
    if (cached?.markets?.length) {
      setMatchMarkets(cached.markets);
    } else {
      setMatchMarkets((prev) => (prev.length ? prev : provisionalWinnerMarketsFromMatch(match)));
    }

    let isCancelled = false;

    const loadOdds = () => {
      fetchAuthoritativeMatchOdds(matchId, team1Name, team2Name, { match }).then((snapshot) => {
        if (isCancelled) return;
        if (snapshot?.markets?.length) setMatchMarkets(snapshot.markets);
      });
    };

    loadOdds();
    let lastOddsWs = 0;
    const poll = setInterval(() => {
      if (Date.now() - lastOddsWs < 4000) return;
      loadOdds();
    }, 2000);

    const unsubOdds = subscribeLiveChannel(`odds:match:${matchId}`, (msg) => {
      if (isCancelled) return;
      const markets = msg.payload?.markets;
      if (msg.eventType === 'odds.updated' && Array.isArray(markets) && markets.length > 0) {
        lastOddsWs = Date.now();
        setMatchMarkets(markets);
      }
    });
    const unsubScores = subscribeLiveChannel(`scores:match:${matchId}`, () => {});

    return () => {
      isCancelled = true;
      clearInterval(poll);
      unsubOdds();
      unsubScores();
    };
  }, [isOpen, match?.id, match?.matchId, oddsStateKey, team1Name, team2Name, match]);

  if (!isOpen || !match) return null;

  const canBet = isMatchBettable(match);
  const isLiveNow = isMatchLive(match);
  const sport = match.sport || 'cricket';

  const liveBatter1 = match?.liveDetails?.batter1;
  const liveBatter2 = match?.liveDetails?.batter2;
  const liveBowler = match?.liveDetails?.bowler;

  // Dynamic Innings & Scores detection for Cricket
  const ld = match?.liveDetails || {};
  const cricketScores = resolveCricketTeamScores(match, ld);
  const isSecondInnings = isCricketSecondInnings(match, ld);
  const maxOvers = getMatchMaxOvers(match) || 20;

  const team1Score = cricketScores.team1;
  const team2Score = cricketScores.team2;
  const chaseText = getChaseText(match, { inningsNum: isSecondInnings ? 2 : 1, battingTeam: team2Name }, team1Name, team2Name);

  const handleOddsClick = (arg1, arg2, arg3, arg4) => {
    let e;
    let selection;
    let odds;
    let selectionName;

    if (arg1?.stopPropagation) {
      e = arg1;
      selection = arg2;
      odds = arg3;
      selectionName = arg4;
    } else {
      // Legacy prop-market calls: (marketName, label, odds)
      selection = `${arg1}:${arg2}`;
      odds = arg3;
      selectionName = String(arg2);
    }

    e?.stopPropagation?.();
    if (!canBet) return;
    const marketName = typeof arg1 === 'string' && !arg1?.stopPropagation ? arg1 : 'Match Winner';
    addBet(match, selection, odds, selectionName, {
      singlePerMatch: true,
      skipMobileOpen: true,
      marketName,
      marketId: marketName === 'Match Winner' ? 'match_winner' : undefined,
    });
  };

  const propOddsBtnClass = (marketName, label) => {
    const selection = `${marketName}:${label}`;
    return `market-odds-btn ${isBetSelected(match.id, selection) ? 'selected' : ''}`;
  };

  const oddsBtnClass = (selection) =>
    `market-odds-btn ${isBetSelected(match.id, selection) ? 'selected' : ''}`;

  return (
    <div className="match-detail-overlay" onClick={onClose} role="presentation">
      <div
        className={`match-detail-modal ${betCount > 0 ? 'has-betslip' : ''}`}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${team1Name} vs ${team2Name}`}
      >
        {/* Header */}
        {(() => {
          const isTest = isTestMatch(match);
          const testDayBadge = isTest ? getTestMatchDayLabel(match) : null;
          const countdownText = !isLiveNow ? formatMatchCountdown(match) : null;

          return (
            <>
              <div className="match-detail-header">
                <div className="match-detail-league" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>🌐 {match.league}</span>
                  <span className="match-detail-sport-tag">{sport.toUpperCase()}</span>
                  {isTest && testDayBadge && (
                    <span className="sports-test-day-badge" style={{ background: 'rgba(168, 85, 247, 0.2)', color: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.4)', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>
                      📅 {testDayBadge}
                    </span>
                  )}
                </div>
                <button className="match-detail-close" onClick={onClose}>
                  <IoClose />
                </button>
              </div>

              {/* 10CRIC Style Live Scoreboard Header */}
              <div className="match-detail-scoreboard">
                <div className="scoreboard-team">
                  <TeamJersey team={match.team1} size={48} isFlying={isLiveNow && isTeamBattingInMatch(match, match.team1)} />
                  <h4>{team1Name}</h4>
                  {isLiveNow && match.liveDetails && (
                    <div className="scoreboard-score">
                      {sport === 'cricket' && (
                        team1Score.displayScore
                          ? `${team1Score.displayScore} (${team1Score.overs} ov)`
                          : `${team1Score.runs}/${team1Score.wickets} (${team1Score.overs} ov)`
                      )}
                      {sport === 'soccer' && (match.liveDetails.score1 ?? 2)}
                      {sport === 'basketball' && (match.liveDetails.score1 ?? 94)}
                    </div>
                  )}
                </div>

                <div className="scoreboard-vs">
                  {isLiveNow ? (
                    <div className="scoreboard-live-badge">
                      <span className="live-pulse" />
                      LIVE {
                        sport === 'cricket' ? (
                          isTest
                            ? (testDayBadge ? `(${testDayBadge})` : '(Test Match)')
                            : (isSecondInnings
                                ? `(INN 2 | ${team2Score.overs}/${maxOvers} OV)`
                                : `(INN 1 | ${team1Score.overs}/${maxOvers} OV)`
                              )
                        ) :
                        sport === 'soccer' ? `(${match.liveDetails?.minute || '74'}' In Play)` : '(In Play)'
                      }
                    </div>
                  ) : (
                    <div className="scoreboard-time">
                      <MatchCountdownTimer match={match} />
                    </div>
                  )}
                  <span className="vs-label">VS</span>
                </div>

                <div className="scoreboard-team">
                  <TeamJersey team={match.team2} size={48} isFlying={isLiveNow && isTeamBattingInMatch(match, match.team2)} />
                  <h4>{team2Name}</h4>
                  {isLiveNow && match.liveDetails && (
                    <div className="scoreboard-score">
                      {sport === 'cricket' && (
                        team2Score.displayScore
                          ? `${team2Score.displayScore} (${team2Score.overs} ov)`
                          : `${team2Score.runs}/${team2Score.wickets} (${team2Score.overs} ov)`
                      )}
                      {sport === 'soccer' && (match.liveDetails.score2 ?? 1)}
                      {sport === 'basketball' && (match.liveDetails.score2 ?? 88)}
                    </div>
                  )}
                </div>
              </div>
            </>
          );
        })()}

        {/* Scrollable body: live stats, market tabs, and markets */}
        <div className="match-detail-scroll">
        {/* 10CRIC Live Cricket Scorecard & Match Center Bar */}
        {sport === 'cricket' && isLiveNow && (
          <div className="cricket-live-center">
            <div className="cricket-chase-pill">
              {chaseText
                ? `⚡ ${chaseText}`
                : isTest
                ? `⚡ Test Match · ${team1Name} vs ${team2Name}`
                : isSecondInnings
                ? `⚡ 2nd Innings: ${team2Name} ${team2Score.runs}/${team2Score.wickets} (${team2Score.overs}/${maxOvers} Ov)`
                : `⚡ 1st Innings: ${team1Name} ${team1Score.runs}/${team1Score.wickets} (${team1Score.overs}/${maxOvers} Ov)`}
            </div>

            {(() => {
              const tossText = resolveCricketTossText(match);
              if (!tossText) return null;
              return (
                <div className="cricket-toss-pill">
                  🪙 {tossText}
                </div>
              );
            })()}

            {/* Live Batter & Bowler Table */}
            {(() => {
              const ld = match.liveDetails || {};
              const t1Name = match?.team1?.name || match?.team1 || 'Team 1';
              const t2Name = match?.team2?.name || match?.team2 || 'Team 2';
              const isTeam2Batting = isTeamBattingInMatch(match, match?.team2) || isSecondInnings;
              const batTeam = isTeam2Batting ? t2Name : t1Name;
              const bowlTeam = isTeam2Batting ? t1Name : t2Name;
              const batRoster = getRosterForTeam(batTeam) || { batters: [], bowlers: [] };
              const bowlRoster = getRosterForTeam(bowlTeam) || { batters: [], bowlers: [] };

              const b1 = ld.batter1 || {};
              const b2 = ld.batter2 || {};
              const b1Name = displayPlayerName(b1.name) || batRoster?.batters?.[0] || 'Batter 1';
              let b2Name = displayPlayerName(b2.name) || batRoster?.batters?.[1] || 'Batter 2';
              if (b2Name === b1Name) b2Name = batRoster?.batters?.[2] || 'Batter 2';

              const bowlerName = displayPlayerName(ld.bowler?.name || ld.bowler) || bowlRoster?.bowlers?.[0] || 'Bowler 1';
              const combinedFours = (b1.fours || 0) + (b2.fours || 0);
              const combinedSixes = (b1.sixes || 0) + (b2.sixes || 0);
              const fours = Math.max(ld.fours || 0, combinedFours);
              const sixes = Math.max(ld.sixes || 0, combinedSixes);
              const extras = ld.extras ?? 0;

              return (
                <div className="cricket-live-tables">
                  <div className="cricket-table-box">
                    <div className="cricket-table-title">BATTER</div>
                    <table className="cricket-mini-table">
                      <thead>
                        <tr>
                          <th>NAME</th>
                          <th>R</th>
                          <th>B</th>
                          <th>4S</th>
                          <th>6S</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>{b1Name} *</td>
                          <td>{b1.runs ?? 0}</td>
                          <td>{b1.balls ?? 0}</td>
                          <td>{b1.fours ?? 0}</td>
                          <td>{b1.sixes ?? 0}</td>
                        </tr>
                        <tr>
                          <td>{b2Name}</td>
                          <td>{b2.runs ?? 0}</td>
                          <td>{b2.balls ?? 0}</td>
                          <td>{b2.fours ?? 0}</td>
                          <td>{b2.sixes ?? 0}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="cricket-table-box">
                    <div className="cricket-table-title">CURRENT BOWLER & STATS</div>
                    <div className="bowler-stat-row">
                      <span>Bowler: <strong>{bowlerName}</strong></span>
                    </div>
                    <div className="innings-stats-grid">
                      <div><span>Fours:</span> <strong>{fours}</strong></div>
                      <div><span>Sixes:</span> <strong>{sixes}</strong></div>
                      <div><span>Extras:</span> <strong>{extras}</strong></div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Live Match Chart Analytics & Line Movement */}
        <LiveChartsWidget match={match} />

        {/* Market Category Filter Tabs */}
        <div className="market-tabs">
          {['all', 'main', 'overs-deliveries', 'player-props', 'specials', 'builder', 'insights'].map(cat => (
            <button
              key={cat}
              className={`market-tab ${activeMarketCategory === cat ? 'active' : ''}`}
              onClick={() => setActiveMarketCategory(cat)}
            >
              {cat === 'all' && 'All Markets'}
              {cat === 'main' && 'Main / Winner'}
              {cat === 'overs-deliveries' && (sport === 'cricket' ? 'Overs & Deliveries' : 'Interval Markets')}
              {cat === 'player-props' && 'Player Props'}
              {cat === 'specials' && 'Specials'}
              {cat === 'builder' && '🛠️ Bet Builder'}
              {cat === 'insights' && '📊 Match Insights'}
            </button>
          ))}
        </div>

        {!canBet && (
          <div className="match-detail-suspended">
            Markets are closed for this match.
          </div>
        )}

        {/* Markets Content List - Authoritative Odds Engine V2 Snapshot */}
        <div className="market-content">

          {/* DYNAMIC AUTHORITATIVE BETTING MARKETS FROM ODDS ENGINE V2 */}
          {activeMarketCategory !== 'builder' && activeMarketCategory !== 'insights' && (
            matchMarkets.length > 0 ? (
              matchMarkets.map((m) => {
                const isCatMatch = activeMarketCategory === 'all'
                  || (activeMarketCategory === 'main' && (m.category === 'main' || m.key === 'winner' || m.marketType === 'MATCH_WINNER'))
                  || (activeMarketCategory === 'overs-deliveries' && (
                    m.category === 'totals' || m.category === 'over' || m.category === 'overs'
                    || m.category === 'delivery' || m.category === 'deliveries'
                    || m.category === 'goals' || m.category === 'spreads' || m.category === 'sets'
                    || m.category === 'games' || m.category === 'halves'
                    || m.marketType === 'TEAM_TOTAL' || m.marketType === 'MATCH_TOTAL' || m.marketType === 'TOTAL' || m.marketType === 'SPREAD'
                  ))
                  || (activeMarketCategory === 'player-props' && (m.category === 'props' || m.category === 'player_props' || m.category === 'h2h'))
                  || (activeMarketCategory === 'specials' && (m.category === 'partnership' || m.category === 'wickets' || m.category === 'specials' || m.category === 'chance'))
                  || activeMarketCategory === m.category
                  || activeMarketCategory === m.categoryGroup;
                if (!isCatMatch) return null;
                const isMarketDetermined = m.status === 'DETERMINED' || m.status === 'CLOSED' || m.status === 'SETTLED' || m.determined;
                const isMarketSuspended = m.status === 'SUSPENDED';

                return (
                  <div key={m.key} className={`market-box ${isMarketDetermined ? 'determined-market' : ''}`}>
                    <div className="market-title">
                      <span>{m.title}</span>
                      {isMarketDetermined && (
                        <span className="market-cashout" style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.4)' }}>
                          {m.status === 'SETTLED' ? 'SETTLED' : 'MARKET DETERMINED'}
                        </span>
                      )}
                      {isMarketSuspended && (
                        <span className="market-cashout" style={{ background: 'rgba(234, 179, 8, 0.2)', color: '#eab308', border: '1px solid rgba(234, 179, 8, 0.4)' }}>
                          SUSPENDED
                        </span>
                      )}
                      {m.key === 'winner' && !isMarketDetermined && !isMarketSuspended && <span className="market-cashout">CASHOUT AVAILABLE</span>}
                    </div>
                    <div className={`market-odds-grid ${m.options.length === 3 ? 'three-col' : (m.options.length === 4 ? 'four-col' : (m.options.length > 4 ? 'multi-col' : 'two-col'))}`}>
                      {m.options.map((opt) => {
                        const isOptBettable = canBet && !isMarketDetermined && !isMarketSuspended && opt.bettable !== false && opt.status !== 'DETERMINED' && opt.status !== 'SUSPENDED' && !opt.determined && opt.odds != null;
                        let displayVal = 'UNAVAILABLE';
                        if (isOptBettable) {
                          displayVal = Number(opt.odds).toFixed(2);
                        } else if (opt.won === true || opt.status === 'WON') {
                          displayVal = 'WON';
                        } else if (opt.won === false || opt.status === 'LOST') {
                          displayVal = 'LOST';
                        } else if (isMarketSuspended || opt.status === 'SUSPENDED') {
                          displayVal = 'SUSPENDED';
                        } else if (isMarketDetermined) {
                          displayVal = 'DETERMINED';
                        }

                        return (
                          <button
                            key={opt.selection || opt.name}
                            type="button"
                            className={`${propOddsBtnClass(m.title, opt.name)} ${!isOptBettable ? 'locked disabled' : ''}`}
                            disabled={!isOptBettable}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!isOptBettable) return;
                              addBet(match, opt.selectionId || opt.selection, opt.odds, opt.name, {
                                singlePerMatch: true,
                                skipMobileOpen: true,
                                marketName: m.title || m.name || 'Match Winner',
                                marketId: m.marketId || m.id || m.key || 'match_winner',
                              });
                            }}
                            style={!isOptBettable ? { opacity: 0.6, cursor: 'not-allowed', background: '#1a2234' } : {}}
                          >
                            <span className="market-label">{opt.name}</span>
                            <span className="market-val">{displayVal}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="match-detail-suspended" style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>
                MARKET UNAVAILABLE — Fetching authoritative live odds...
              </div>
            )
          )}

          {/* BET BUILDER UI VIEW — AUTHORITATIVE snapshot LEGS */}
          {activeMarketCategory === 'builder' && (
            <div className="builder-view">
              <div className="builder-header-box">
                <h4>🛠️ Same Match Bet Builder</h4>
                <p>Select up to 4 legs from active authoritative markets to construct a custom parlay.</p>
              </div>

              <div className="builder-options-list">
                {matchMarkets.filter(m => m.status === 'OPEN').map((m) => (
                  <div key={m.key} className="builder-option-group">
                    <h5>{m.title}</h5>
                    <div className={`market-odds-grid ${m.options.length === 3 ? 'three-col' : 'two-col'}`}>
                      {m.options.filter(o => o.bettable !== false && o.odds != null).map((opt) => {
                        const isSel = builderLegs.some(l => l.label === opt.name);
                        return (
                          <button
                            key={opt.selection || opt.name}
                            type="button"
                            className={`market-odds-btn ${isSel ? 'selected' : ''}`}
                            onClick={() => toggleBuilderLeg(opt.name, opt.odds)}
                          >
                            <span className="market-label">{opt.name}</span>
                            <span className="market-val">{Number(opt.odds).toFixed(2)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="builder-summary-box">
                <div className="builder-legs-chips">
                  {builderLegs.length === 0 ? (
                    <span className="builder-empty-hint">Tap choices above to add legs to your builder</span>
                  ) : (
                    builderLegs.map((leg) => (
                      <span key={leg.label} className="builder-leg-chip">
                        {leg.label} ({leg.odds.toFixed(2)})
                        <button type="button" onClick={() => toggleBuilderLeg(leg.label, leg.odds)}>×</button>
                      </span>
                    ))
                  )}
                </div>

                <div className="builder-bottom-row">
                  <div className="builder-odds-result">
                    <span>Combined Odds:</span>
                    <strong>{builderCombinedOdds.toFixed(2)}</strong>
                  </div>

                  <button
                    type="button"
                    className="deposit-confirm-btn"
                    disabled={builderLegs.length === 0}
                    onClick={() => {
                      const desc = `BetBuilder (${builderLegs.length} legs): ${builderLegs.map(l => l.label).join(' + ')}`;
                      addBet(
                        match,
                        `Builder:${Date.now()}`,
                        builderCombinedOdds,
                        desc,
                        { marketName: '🛠️ Same Match Bet Builder' },
                      );
                      setBuilderLegs([]);
                    }}
                  >
                    Add Bet Builder to Slip
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* MATCH INSIGHTS & H2H VIEW */}
          {activeMarketCategory === 'insights' && (
            <div className="insights-view">
              {(liveBatter1?.name || liveBowler?.name) ? (
                <div className="insights-card">
                  <h4>⭐ Live player matchup</h4>
                  <div className="player-matchup-grid">
                    <div className="player-box">
                      <strong>{displayPlayerName(liveBatter1?.name) || '—'}</strong>
                      <span>
                        {liveBatter1
                          ? `${liveBatter1.runs ?? 0} (${liveBatter1.balls ?? 0}) · ${liveBatter1.fours ?? 0} fours · ${liveBatter1.sixes ?? 0} sixes`
                          : 'Waiting for live batter'}
                      </span>
                    </div>
                    <div className="player-vs">VS</div>
                    <div className="player-box">
                      <strong>{displayPlayerName(liveBowler?.name) || '—'}</strong>
                      <span>
                        {liveBowler
                          ? `${liveBowler.overs ?? 0} ov · ${liveBowler.wickets ?? 0}/${liveBowler.runs ?? 0}${liveBowler.economy != null ? ` · econ ${liveBowler.economy}` : ''}`
                          : 'Waiting for live bowler'}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="insights-card">
                  <h4>Live details</h4>
                  <p>Player matchup, form, and H2H appear here when the live source sends them. Nothing is invented.</p>
                </div>
              )}
            </div>
          )}

        </div>

        </div>

        <BetSlipFooter variant="modal" onPlaced={onClose} />
      </div>
    </div>
  );
}
