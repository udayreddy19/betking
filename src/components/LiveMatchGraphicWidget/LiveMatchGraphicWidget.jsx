import './LiveMatchGraphicWidget.css';

export default function LiveMatchGraphicWidget({ match }) {
  if (!match) return null;

  const sport = match.sport || 'cricket';
  const team1 = match.team1?.name || 'Home Team';
  const team2 = match.team2?.name || 'Away Team';

  // --- CRICKET GRAPHIC RENDERER ---
  if (sport === 'cricket' || sport === 'virtual-cricket') {
    const score1 = match.liveDetails?.runs || 71;
    const wickets1 = match.liveDetails?.wickets || 3;
    const score2 = match.liveDetails?.score2 || 148;
    const wickets2 = match.liveDetails?.wickets2 || 5;
    const overs = match.liveDetails?.overs || '8.5';
    const reqRuns = Math.max(0, (score2 + 1) - score1);

    return (
      <div className="live-graphic-card">
        <div className="graphic-scoreboard-header">
          <div className="graphic-team-name">{team1}</div>
          <div className="graphic-inn-badge">INN 2 | {overs}/20 OV</div>
          <div className="graphic-team-name">{team2}</div>
        </div>

        <div className="graphic-scores-row">
          <span className="main-score">{score1}/{wickets1}</span>
          <span className="score-divider">:</span>
          <span className="main-score">{score2}/{wickets2}</span>
        </div>

        <div className="graphic-chase-text">
          {team1} ({score1}/{wickets1}) require {reqRuns} runs from 67 balls.
        </div>

        <div className="graphic-chart-box">
          <div className="chart-bars">
            {[4, 6, 2, 8, 12, 10, 5, 9, 14, 8, 11, 7, 3, 15, 6, 12, 9, 4, 10, 8].map((runs, i) => (
              <div
                key={i}
                className={`chart-bar ${i === 8 ? 'active-over' : ''}`}
                style={{ height: `${Math.min(100, (runs / 16) * 100)}%` }}
                title={`Over ${i + 1}: ${runs} runs`}
              />
            ))}
          </div>
          <div className="chart-axis-labels">
            <span>0</span><span>4</span><span>8</span><span>12</span><span>16</span><span>20</span>
          </div>
        </div>

        <div className="ball-tracker-row">
          <span className="over-label">OVER 8</span>
          <div className="ball-pills">
            <span className="ball-pill wicket">W</span>
            <span className="ball-pill">1</span>
            <span className="ball-pill">2</span>
            <span className="ball-pill">2</span>
            <span className="ball-pill">1</span>
            <span className="ball-pill">1</span>
          </div>
          <span className="over-label" style={{ marginLeft: 'auto' }}>OVER 9</span>
          <div className="ball-pills">
            <span className="ball-pill">1</span>
            <span className="ball-pill dot">•</span>
            <span className="ball-pill dot">•</span>
          </div>
        </div>

        <div className="field-visualizer">
          <div className="cricket-field-bg">
            <div className="pitch-strip">
              <div className="pitch-stumps top" />
              <div className="pitch-crease top" />
              <div className="pitch-ball-impact" />
              <div className="pitch-crease bottom" />
              <div className="pitch-stumps bottom" />
            </div>

            <div className="field-overlay-content">
              <div className="field-stats-col">
                <div className="field-stat-header">
                  <span>BATTER</span><span>R</span><span>B</span><span>4S</span><span>6S</span>
                </div>
                <div className="field-stat-row active-batter">
                  <span>SR Bhudia ✓</span><span>2</span><span>4</span><span>0</span><span>0</span>
                </div>
                <div className="field-stat-row">
                  <span>RR Patel</span><span>7</span><span>8</span><span>0</span><span>0</span>
                </div>
              </div>
              <div className="field-stats-col">
                <div className="field-stat-header">
                  <span>CURRENT BOWLER</span><span>INNINGS STATS</span>
                </div>
                <div className="field-stat-row">
                  <span>Rizwan Butt</span><span className="stat-highlight">Fours: 9</span>
                </div>
                <div className="field-stat-row">
                  <span>3.2-0-18-1</span><span className="stat-highlight">Sixes: 1</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- SOCCER / FOOTBALL GRAPHIC RENDERER ---
  if (sport === 'soccer' || sport === 'esoccer') {
    const score1 = match.liveDetails?.score1 ?? 2;
    const score2 = match.liveDetails?.score2 ?? 1;
    const minute = match.liveDetails?.minute || 74;

    return (
      <div className="live-graphic-card">
        <div className="graphic-scoreboard-header">
          <div className="graphic-team-name">{team1}</div>
          <div className="graphic-inn-badge">SOCCER | {minute}' 2ND HALF</div>
          <div className="graphic-team-name">{team2}</div>
        </div>

        <div className="graphic-scores-row">
          <span className="main-score">{score1}</span>
          <span className="score-divider">:</span>
          <span className="main-score">{score2}</span>
        </div>

        <div className="graphic-chase-text" style={{ color: '#4ade80' }}>
          ⚡ 74' - Dangerous attack on goal! High possession in opponent half.
        </div>

        {/* Soccer Pitch Graphic */}
        <div className="field-visualizer">
          <div className="soccer-pitch-bg">
            <div className="soccer-half-line" />
            <div className="soccer-center-circle" />
            <div className="soccer-box left" />
            <div className="soccer-box right" />
            <div className="soccer-ball" />

            <div className="field-overlay-content">
              <div className="field-stats-col">
                <div className="field-stat-header">
                  <span>MATCH STATS</span><span>{team1}</span><span>{team2}</span>
                </div>
                <div className="field-stat-row">
                  <span>Shots on Target</span><span className="stat-highlight">6</span><span>4</span>
                </div>
                <div className="field-stat-row">
                  <span>Possession %</span><span className="stat-highlight">56%</span><span>44%</span>
                </div>
                <div className="field-stat-row">
                  <span>Corner Kicks</span><span>7</span><span className="stat-highlight">3</span>
                </div>
              </div>

              <div className="field-stats-col">
                <div className="field-stat-header">
                  <span>DISCIPLINE</span><span>{team1}</span><span>{team2}</span>
                </div>
                <div className="field-stat-row">
                  <span>Yellow Cards</span><span>2</span><span>1</span>
                </div>
                <div className="field-stat-row">
                  <span>Fouls Committed</span><span>9</span><span>12</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- BASKETBALL GRAPHIC RENDERER ---
  if (sport === 'basketball') {
    const score1 = match.liveDetails?.score1 ?? 94;
    const score2 = match.liveDetails?.score2 ?? 88;

    return (
      <div className="live-graphic-card">
        <div className="graphic-scoreboard-header">
          <div className="graphic-team-name">{team1}</div>
          <div className="graphic-inn-badge">NBA | 4TH QTR 3:45</div>
          <div className="graphic-team-name">{team2}</div>
        </div>

        <div className="graphic-scores-row">
          <span className="main-score">{score1}</span>
          <span className="score-divider">:</span>
          <span className="main-score">{score2}</span>
        </div>

        <div className="graphic-chase-text" style={{ color: '#f59e0b' }}>
          🏀 3-POINTER! Swish from downtown!
        </div>

        {/* Hardwood Basketball Court Graphic */}
        <div className="field-visualizer">
          <div className="basketball-court-bg">
            <div className="court-center-line" />
            <div className="court-center-circle" />
            <div className="court-3pt-left" />
            <div className="court-3pt-right" />

            <div className="field-overlay-content">
              <div className="field-stats-col">
                <div className="field-stat-header">
                  <span>TEAM STATS</span><span>{team1}</span><span>{team2}</span>
                </div>
                <div className="field-stat-row">
                  <span>Field Goal %</span><span className="stat-highlight">49.2%</span><span>45.1%</span>
                </div>
                <div className="field-stat-row">
                  <span>3-PT Made</span><span className="stat-highlight">14</span><span>10</span>
                </div>
                <div className="field-stat-row">
                  <span>Rebounds</span><span>38</span><span>34</span>
                </div>
              </div>

              <div className="field-stats-col">
                <div className="field-stat-header">
                  <span>GAME LEADERS</span>
                </div>
                <div className="field-stat-row active-batter">
                  <span>LeBron James</span><span>28 PTS / 8 AST</span>
                </div>
                <div className="field-stat-row">
                  <span>Jayson Tatum</span><span>24 PTS / 9 REB</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- TENNIS / TABLE TENNIS GRAPHIC RENDERER ---
  if (sport === 'tennis' || sport === 'table-tennis') {
    return (
      <div className="live-graphic-card">
        <div className="graphic-scoreboard-header">
          <div className="graphic-team-name">{team1}</div>
          <div className="graphic-inn-badge">SET 2 | 30-15</div>
          <div className="graphic-team-name">{team2}</div>
        </div>

        <div className="graphic-scores-row">
          <span className="main-score">6-4, 4-3</span>
        </div>

        <div className="graphic-chase-text" style={{ color: '#2dd4bf' }}>
          🎾 ACE! Serve down the T line.
        </div>

        {/* Tennis Court Graphic */}
        <div className="field-visualizer">
          <div className="tennis-court-bg">
            <div className="tennis-net-line" />
            <div className="field-overlay-content">
              <div className="field-stats-col">
                <div className="field-stat-header">
                  <span>MATCH STATS</span><span>P1</span><span>P2</span>
                </div>
                <div className="field-stat-row">
                  <span>Aces</span><span className="stat-highlight">12</span><span>8</span>
                </div>
                <div className="field-stat-row">
                  <span>1st Serve %</span><span className="stat-highlight">68%</span><span>61%</span>
                </div>
              </div>
              <div className="field-stats-col">
                <div className="field-stat-header">
                  <span>BREAK POINTS</span>
                </div>
                <div className="field-stat-row">
                  <span>Break Points Won</span><span>4/6</span><span>1/3</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- DEFAULT / KABADDI / OTHER SPORTS GRAPHIC ---
  return (
    <div className="live-graphic-card">
      <div className="graphic-scoreboard-header">
        <div className="graphic-team-name">{team1}</div>
        <div className="graphic-inn-badge">{sport.toUpperCase()} | LIVE</div>
        <div className="graphic-team-name">{team2}</div>
      </div>

      <div className="graphic-scores-row">
        <span className="main-score">{match.liveDetails?.score1 ?? 28}</span>
        <span className="score-divider">:</span>
        <span className="main-score">{match.liveDetails?.score2 ?? 24}</span>
      </div>

      <div className="field-visualizer">
        <div className="cricket-field-bg" style={{ background: '#312e81' }}>
          <div className="field-overlay-content">
            <div className="field-stats-col">
              <div className="field-stat-header">
                <span>LIVE MATCH ACTION</span>
              </div>
              <div className="field-stat-row active-batter">
                <span>Raid / Attack Points</span><span>18</span>
              </div>
              <div className="field-stat-row">
                <span>Tackle / Defence Points</span><span>10</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
