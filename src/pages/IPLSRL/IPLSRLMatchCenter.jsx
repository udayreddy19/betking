import { useState, useEffect } from 'react';
import { generateIPLSRLCommentary } from '../../../lib/iplSrlCommentaryEngine.mjs';
import { useBetSlip } from '../../context/BetSlipContext';
import './IPLSRLMatchCenter.css';

export default function IPLSRLMatchCenter() {
  const { addBet } = useBetSlip();
  const [activeTab, setActiveTab] = useState('match'); // 'match' | 'scorecard' | 'commentary' | 'markets'

  const [matchState, setMatchState] = useState({
    matchId: 'fix_IPLSRL_2026_m1',
    status: 'IN_PROGRESS',
    homeTeam: { teamId: 'csk_srl', name: 'Chennai Super Kings SRL', shortName: 'CSK', logo: '🦁' },
    awayTeam: { teamId: 'mi_srl', name: 'Mumbai Indians SRL', shortName: 'MI', logo: '⚡' },
    currentInnings: 2,
    targetScore: 186,
    isSuspended: false,
    innings1: { runs: 185, wickets: 5, overs: 20, balls: 0 },
    innings2: { runs: 112, wickets: 3, overs: 12, balls: 4 },
  });

  const [markets, setMarkets] = useState([]);
  const [probs, setProbs] = useState({ homeWinProbability: 0.58, awayWinProbability: 0.42, projectedScore: 178 });

  const [recentDeliveries, setRecentDeliveries] = useState([
    { over: 12, ball: 4, striker: 'Rohit Sharma', bowler: 'M Pathirana', outcome: 'FOUR', runs: 4 },
    { over: 12, ball: 3, striker: 'Rohit Sharma', bowler: 'M Pathirana', outcome: 'ONE', runs: 1 },
    { over: 12, ball: 2, striker: 'SKY', bowler: 'M Pathirana', outcome: 'SIX', runs: 6 },
    { over: 12, ball: 1, striker: 'SKY', bowler: 'M Pathirana', outcome: 'DOT', runs: 0 },
  ]);

  const [commentaryList, setCommentaryList] = useState([
    { over: '12.4', text: 'M Pathirana to Rohit Sharma, FOUR! Driven crisply through covers for FOUR!' },
    { over: '12.3', text: 'M Pathirana to Rohit Sharma, 1 run, pushed down to long-on.' },
    { over: '12.2', text: 'M Pathirana to SKY, SIX! Clears the front leg and lofts it cleanly over long-off!' },
    { over: '12.1', text: 'M Pathirana to SKY, no run, good length delivery, defended.' },
  ]);

  // Fetch Authoritative Server SRL Match State & OddsEngineV3 Markets
  useEffect(() => {
    const fetchServerOdds = () => {
      fetch(`/api/public/sports/matches/${matchState.matchId}/odds`)
        .then(r => r.json())
        .then(data => {
          if (data && data.success && data.markets) {
            setMarkets(data.markets.map(m => ({
              marketId: m.marketId,
              title: m.name || m.title,
              status: m.status,
              options: (m.selections || m.options || []).map(s => ({
                selection: s.selectionId || s.selection,
                name: s.name,
                odds: Number(s.odds) > 1 ? Number(s.odds) : null,
                status: s.status,
                bettable: s.bettable !== false,
              })),
            })));
          }
        })
        .catch(() => {});
    };

    fetchServerOdds();
    const interval = setInterval(fetchServerOdds, 4000);
    return () => clearInterval(interval);
  }, [matchState.matchId]);

  const inn2OversFloat = matchState.innings2.overs + matchState.innings2.balls / 6;
  const crr = inn2OversFloat > 0 ? (matchState.innings2.runs / inn2OversFloat).toFixed(2) : '0.00';
  const oversLeft = Math.max(0.1, 20 - inn2OversFloat);
  const runsNeeded = Math.max(0, matchState.targetScore - matchState.innings2.runs);
  const rrr = (runsNeeded / oversLeft).toFixed(2);

  return (
    <div className="match-center-container">
      {/* Header Banner */}
      <div className="match-center-header">
        <span className="live-pill">🔴 LIVE IPLSRL MATCH CENTER</span>
        <span>MA Chidambaram Stadium, Chennai · Dew Factor: High</span>
      </div>

      {/* Main Pitch Graphic Scorecard */}
      <div className="match-pitch-card">
        <div className="match-teams-bar">
          <div className="match-team-box">
            <span className="t-logo">{matchState.homeTeam.logo}</span>
            <div>
              <h3>{matchState.homeTeam.name}</h3>
              <p className="inn-score">{matchState.innings1.runs}/{matchState.innings1.wickets} (20.0 ov)</p>
            </div>
          </div>

          <div className="match-center-target">
            <span className="target-pill">Target: {matchState.targetScore}</span>
            <p className="need-txt">Need {runsNeeded} runs in {(oversLeft * 6).toFixed(0)} balls</p>
          </div>

          <div className="match-team-box right">
            <div>
              <h3>{matchState.awayTeam.name}</h3>
              <p className="inn-score active">{matchState.innings2.runs}/{matchState.innings2.wickets} ({matchState.innings2.overs}.{matchState.innings2.balls} ov)</p>
            </div>
            <span className="t-logo">{matchState.awayTeam.logo}</span>
          </div>
        </div>

        {/* Run Rates Bar */}
        <div className="match-rr-strip">
          <span>CRR: <strong>{crr}</strong></span>
          <span>RRR: <strong className="rrr-val">{rrr}</strong></span>
          <span>Projected Score: <strong>{probs.projectedScore || 178}</strong></span>
        </div>

        {/* Live Win Probability Bar */}
        <div className="match-prob-section">
          <div className="prob-label-row">
            <span>{matchState.homeTeam.shortName} {(probs.homeWinProbability * 100).toFixed(0)}%</span>
            <span>Win Probability</span>
            <span>{matchState.awayTeam.shortName} {(probs.awayWinProbability * 100).toFixed(0)}%</span>
          </div>
          <div className="prob-bar-container">
            <div className="prob-bar-fill" style={{ width: `${(probs.homeWinProbability * 100)}%` }}></div>
          </div>
        </div>

        {/* Last 6 Balls */}
        <div className="match-balls-strip">
          <span>Current Over:</span>
          <div className="balls-row">
            {recentDeliveries.map((d, i) => (
              <span key={i} className={`ball-bubble ${d.outcome === 'SIX' || d.outcome === 'FOUR' ? 'four-six' : d.outcome === 'WICKET' ? 'wicket' : ''}`}>
                {d.outcome === 'SIX' ? '6' : d.outcome === 'FOUR' ? '4' : d.outcome === 'WICKET' ? 'W' : d.runs}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Match Center Tabs */}
      <div className="match-center-tabs">
        {['match', 'markets', 'commentary', 'scorecard'].map(t => (
          <button
            key={t}
            className={`mc-tab-btn ${activeTab === t ? 'active' : ''}`}
            onClick={() => setActiveTab(t)}
          >
            {t.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Tab Contents */}
      {activeTab === 'markets' && (
        <div className="match-markets-view">
          <h3>⚡ Live Dynamic Markets {matchState.isSuspended && <span className="susp-badge">🔒 MARKETS SUSPENDED</span>}</h3>
          <div className="match-markets-grid">
            {markets.map(m => (
              <div key={m.marketId} className="mc-market-card">
                <div className="mc-market-header">
                  <span>{m.title}</span>
                  <span className={`mc-status ${m.status.toLowerCase()}`}>{m.status}</span>
                </div>
                <div className="mc-options-row">
                  {m.options.filter((opt) => Number(opt.odds) > 1).map(opt => (
                    <button
                      key={opt.selection}
                      disabled={m.status === 'SUSPENDED' || m.status === 'SETTLED'}
                      className="mc-odds-btn"
                      onClick={() => addBet({ id: `${m.marketId}_${opt.selection}`, match: `${matchState.homeTeam.shortName} vs ${matchState.awayTeam.shortName}`, selection: opt.name, odds: opt.odds })}
                    >
                      <span>{opt.name}</span>
                      <span className="odds-val">{Number(opt.odds).toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'commentary' && (
        <div className="match-commentary-view">
          <h3>🎙️ Live Ball-by-Ball Commentary</h3>
          <div className="commentary-feed">
            {commentaryList.map((c, i) => (
              <div key={i} className="comm-item">
                <span className="comm-over">{c.over}</span>
                <span className="comm-text">{c.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'match' && (
        <div className="match-overview-view">
          <h3>📊 Key Match Insights & Momentum</h3>
          <div className="mc-insights-box">
            <p>💡 <strong>Pitch Report:</strong> MA Chidambaram Stadium pitch offering slight turn for spin bowlers in the second innings. Heavy dew expected in overs 15–20.</p>
            <p>🔥 <strong>Match Situation:</strong> Mumbai Indians SRL need {runsNeeded} runs off {(oversLeft * 6).toFixed(0)} balls. Current RRR is {rrr}.</p>
          </div>
        </div>
      )}
    </div>
  );
}
