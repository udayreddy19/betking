import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { TestCricketEngine } from '../../../lib/testCricketEngine.mjs';
import './TestCricketScorecard.css';

export default function TestCricketScorecard({ matchId }) {
  const [engine, setEngine] = useState(null);
  const [activeTab, setActiveTab] = useState('scorecard'); // 'scorecard', 'summary', 'timeline', 'commentary'
  const [selectedInningsIdx, setSelectedInningsIdx] = useState(0);

  useEffect(() => {
    // Instantiate real TestCricketEngine
    const testEng = new TestCricketEngine({
      matchId: matchId || 'test_match_live_01',
      seriesName: 'ICC World Test Championship Final',
      venue: 'Lord\'s Cricket Ground, London',
      teamA: { name: 'India', shortName: 'IND', color: '#1d4ed8' },
      teamB: { name: 'England', shortName: 'ENG', color: '#dc2626' },
    });

    testEng.performToss('India', 'BAT');

    // Simulate 60 deliveries for rich live stats
    for (let i = 0; i < 60; i++) {
      const isWicket = i === 18 || i === 42;
      const runs = i % 5 === 0 ? 4 : (i % 7 === 0 ? 6 : (i % 2));
      testEng.deliverBall({ runs, wicket: isWicket, wicketType: isWicket ? 'caught' : null });
    }

    setEngine(testEng);
  }, [matchId]);

  if (!engine) return null;

  const live = engine.getLiveSnapshot();
  const scorecard = engine.getFullScorecard();
  const currentInningsData = scorecard.innings[selectedInningsIdx] || scorecard.innings[0];

  return (
    <div className="test-scorecard-container">
      {/* Header */}
      <div className="test-scorecard-header">
        <div className="test-header-meta">
          <span>{engine.seriesName} · {engine.venue}</span>
          <span className="test-session-badge">Day {live.currentDay} · {live.currentSession} Session</span>
        </div>

        <div className="test-match-title">
          {engine.teamA.name} vs {engine.teamB.name} — Test Match
        </div>

        <div className="test-match-status-bar">
          <span>State: <strong>{live.state}</strong></span>
          {live.currentInnings && (
            <span>
              {live.currentInnings.batTeam}: <strong>{live.currentInnings.runs}/{live.currentInnings.wickets}</strong> ({live.currentInnings.overs} ov)
            </span>
          )}
          {live.currentInnings?.lead > 0 && (
            <span className="test-lead-tag">Leads by {live.currentInnings.lead} runs</span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="test-scorecard-tabs">
        <button
          type="button"
          className={`test-tab-btn ${activeTab === 'scorecard' ? 'active' : ''}`}
          onClick={() => setActiveTab('scorecard')}
        >
          4-Innings Scorecard
        </button>
        <button
          type="button"
          className={`test-tab-btn ${activeTab === 'summary' ? 'active' : ''}`}
          onClick={() => setActiveTab('summary')}
        >
          Match Summary
        </button>
        <button
          type="button"
          className={`test-tab-btn ${activeTab === 'timeline' ? 'active' : ''}`}
          onClick={() => setActiveTab('timeline')}
        >
          Session Timeline
        </button>
        <button
          type="button"
          className={`test-tab-btn ${activeTab === 'commentary' ? 'active' : ''}`}
          onClick={() => setActiveTab('commentary')}
        >
          Ball-by-Ball Feed
        </button>
      </div>

      {/* Body */}
      <div className="test-scorecard-body">
        <AnimatePresence mode="wait">
          {activeTab === 'scorecard' && (
            <motion.div
              key="scorecard"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {/* Innings Selector Sub-tabs */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                {scorecard.innings.map((inn, idx) => (
                  <button
                    key={inn.inningsNum}
                    type="button"
                    style={{
                      padding: '6px 14px',
                      borderRadius: '16px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      border: '1px solid var(--color-border)',
                      background: selectedInningsIdx === idx ? 'var(--color-primary)' : 'var(--color-bg-alt)',
                      color: selectedInningsIdx === idx ? '#ffffff' : 'var(--color-text)',
                      cursor: 'pointer',
                    }}
                    onClick={() => setSelectedInningsIdx(idx)}
                  >
                    Innings {inn.inningsNum}: {inn.batTeam} ({inn.totalRuns}/{inn.totalWickets})
                  </button>
                ))}
              </div>

              {currentInningsData && (
                <>
                  {/* Batting Table */}
                  <div className="test-table-section">
                    <div className="test-table-title">
                      <span>{currentInningsData.batTeam} 1st Innings Batting</span>
                      <span>{currentInningsData.totalRuns}/{currentInningsData.totalWickets} ({currentInningsData.totalOvers} ov)</span>
                    </div>

                    <table className="test-data-table">
                      <thead>
                        <tr>
                          <th>Batter</th>
                          <th>Dismissal</th>
                          <th>R</th>
                          <th>B</th>
                          <th>4s</th>
                          <th>6s</th>
                          <th>SR</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentInningsData.battingCard.map((b) => (
                          <tr key={b.name}>
                            <td className="test-batter-name">
                              {b.name}
                              {b.milestones.map((m) => (
                                <span key={m} className="test-milestone-chip">{m}</span>
                              ))}
                            </td>
                            <td className="test-dismissal-text">{b.dismissalText}</td>
                            <td><strong>{b.runs}</strong></td>
                            <td>{b.balls}</td>
                            <td>{b.fours}</td>
                            <td>{b.sixes}</td>
                            <td>{b.strikeRate}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Bowling Table */}
                  <div className="test-table-section">
                    <div className="test-table-title">
                      <span>{currentInningsData.bowlTeam} Bowling</span>
                    </div>

                    <table className="test-data-table">
                      <thead>
                        <tr>
                          <th>Bowler</th>
                          <th>O</th>
                          <th>M</th>
                          <th>R</th>
                          <th>W</th>
                          <th>Econ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentInningsData.bowlingCard.map((bw) => (
                          <tr key={bw.name}>
                            <td className="test-batter-name">{bw.name}</td>
                            <td>{bw.overs}</td>
                            <td>{bw.maidens}</td>
                            <td>{bw.runs}</td>
                            <td><strong>{bw.wickets}</strong></td>
                            <td>{bw.economy}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Fall of Wickets */}
                  {currentInningsData.fallOfWickets.length > 0 && (
                    <div className="test-table-section">
                      <div className="test-table-title">Fall of Wickets</div>
                      <div className="test-fow-box">
                        {currentInningsData.fallOfWickets.map((f, i) => (
                          <span key={i}>
                            {f.runs}-{f.wicketNum} ({f.batter}, {f.overs} ov){i < currentInningsData.fallOfWickets.length - 1 ? ' · ' : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </motion.div>
          )}

          {activeTab === 'summary' && (
            <motion.div
              key="summary"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <h4>Match Overview</h4>
              {(() => {
                const tossWinner = live?.toss?.winner || live?.team1?.name || 'Home Team';
                const tossDecision = live?.toss?.decision || 'bat';
                return (
                  <p style={{ marginTop: '8px', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
                    🪙 Toss: <strong>{tossWinner}</strong> won the toss and elected to {tossDecision}.
                  </p>
                );
              })()}
              {live.playerOfTheMatch && (
                <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(124, 58, 237, 0.08)', borderRadius: '12px' }}>
                  <h5 style={{ color: 'var(--color-primary)', fontWeight: 800 }}>⭐ Player of the Match</h5>
                  <p style={{ fontSize: '1rem', fontWeight: 800, marginTop: '4px' }}>{live.playerOfTheMatch.name}</p>
                  <span style={{ fontSize: '0.78rem', opacity: 0.8 }}>Impact Score: {live.playerOfTheMatch.impactPoints} pts</span>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'timeline' && (
            <motion.div
              key="timeline"
              className="test-timeline-grid"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {[1, 2, 3, 4, 5].map((d) => (
                <div key={d} className="test-timeline-card">
                  <h5>Day {d}</h5>
                  <p style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                    Target: 90 overs · Morning / Afternoon / Evening
                  </p>
                  <span style={{ fontSize: '0.72rem', color: d <= live.currentDay ? '#16a34a' : 'var(--color-text-muted)', fontWeight: 700, marginTop: '8px', display: 'block' }}>
                    {d < live.currentDay ? 'Completed' : (d === live.currentDay ? 'In Progress' : 'Scheduled')}
                  </span>
                </div>
              ))}
            </motion.div>
          )}

          {activeTab === 'commentary' && (
            <motion.div
              key="commentary"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {live.recentCommentary.map((c) => (
                <div key={c.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--color-border-light)', fontSize: '0.85rem' }}>
                  <span style={{ fontWeight: 800, color: 'var(--color-primary)', marginRight: '8px' }}>{c.over || 'EVENT'}</span>
                  <span>{c.text}</span>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
