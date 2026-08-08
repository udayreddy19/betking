import TeamJersey from '../TeamJersey/TeamJersey';
import { isTrulyLiveMatch } from '../../utils/matchBetting';
import { resolveCricketTeamScores, isCricketSecondInnings, teamNameMatches } from '../../utils/cricketScores';
import { IPL_SRL_LEAGUE } from '../../data/iplSrlMatches';
import './SrlLeaguePanel.css';

function inningsLabel(match) {
  const ld = match?.liveDetails || {};
  if (isCricketSecondInnings(match, ld)) return 'Second innings';
  return 'First innings';
}

function teamScoreLine(match, teamName, side) {
  const ld = match?.liveDetails || {};
  const scores = resolveCricketTeamScores(match, ld);
  const score = side === 1 ? scores.team1 : scores.team2;
  const isBattingFirst = ld.firstTeamName
    ? teamNameMatches(teamName, ld.firstTeamName)
    : side === 1;
  const isChase = isCricketSecondInnings(match, ld);
  const isBattingNow = isChase
    ? !teamNameMatches(ld.firstTeamName || match.team1?.name, teamName)
    : isBattingFirst;

  const hasScore = (score.runs ?? 0) > 0 || (score.wickets ?? 0) > 0 || (score.balls ?? 0) > 0;
  if (!hasScore && !isBattingNow) return '0';

  const overs = score.overs && score.overs !== '0.0' ? ` (${score.overs} ov.)` : '';
  return `${score.runs ?? 0}/${score.wickets ?? 0}${overs}`;
}

export default function SrlLeaguePanel({
  matches,
  onSelectMatch,
  onQuickBet,
  isBetSelected,
}) {
  if (!matches.length) {
    return (
      <div className="srl-league-empty">
        <p>No Indian Premier League SRL matches right now.</p>
      </div>
    );
  }

  return (
    <div className="srl-league-panel">
      <header className="srl-league-panel__header">
        <h2 className="srl-league-panel__title">{IPL_SRL_LEAGUE}</h2>
      </header>

      <div className="srl-league-panel__list">
        {matches.map((match) => {
          const isLive = isTrulyLiveMatch(match);
          const markets = match.srlMarkets;
          const extra = match.extraMarkets ?? 24;

          return (
            <article key={match.id} className={`srl-match-card ${isLive ? 'srl-match-card--live' : ''}`}>
              <div className="srl-match-card__top">
                <span className="srl-match-card__league">{IPL_SRL_LEAGUE}</span>
                {(() => {
                  const tossText = match.toss
                    ? (typeof match.toss === 'string' ? match.toss : `${match.toss.winner || match.team1.name} won the toss & elected to ${match.toss.decision || 'bat'}`)
                    : `${match.team1.name} won the toss & elected to bat`;
                  return (
                    <span className="srl-match-card__toss" style={{ fontSize: '0.72rem', color: 'var(--color-accent-gold)', marginLeft: 'auto', marginRight: '8px' }}>
                      🪙 {tossText}
                    </span>
                  );
                })()}
                {isLive ? (
                  <span className="srl-match-card__innings">{inningsLabel(match)}</span>
                ) : (
                  <span className="srl-match-card__time">{match.time}</span>
                )}
              </div>

              <button
                type="button"
                className="srl-match-card__body"
                onClick={() => onSelectMatch(match.id)}
              >
                <div className="srl-match-card__team">
                  <TeamJersey team={match.team1} size={36} />
                  <span className="srl-match-card__team-name">{match.team1.name}</span>
                  {isLive && (
                    <strong className="srl-match-card__score">
                      {teamScoreLine(match, match.team1.name, 1)}
                    </strong>
                  )}
                </div>
                <div className="srl-match-card__team">
                  <TeamJersey team={match.team2} size={36} />
                  <span className="srl-match-card__team-name">{match.team2.name}</span>
                  {isLive && (
                    <strong className="srl-match-card__score">
                      {teamScoreLine(match, match.team2.name, 2)}
                    </strong>
                  )}
                </div>
              </button>

              <div className="srl-match-card__markets">
                <div className="srl-match-card__odds-row">
                  <button
                    type="button"
                    className={`srl-odds-btn ${isBetSelected(match.id, '1') ? 'selected' : ''}`}
                    onClick={() => onQuickBet(match, '1', match.odds?.team1, match.team1.name)}
                  >
                    <span>1</span>
                    <strong>{Number(match.odds?.team1 || 0).toFixed(2)}</strong>
                  </button>
                  <button
                    type="button"
                    className={`srl-odds-btn ${isBetSelected(match.id, '2') ? 'selected' : ''}`}
                    onClick={() => onQuickBet(match, '2', match.odds?.team2, match.team2.name)}
                  >
                    <span>2</span>
                    <strong>{Number(match.odds?.team2 || 0).toFixed(2)}</strong>
                  </button>
                </div>

                {isLive && markets?.totalRuns != null && (
                  <div className="srl-match-card__ou-row">
                    <button
                      type="button"
                      className={`srl-ou-btn ${isBetSelected(match.id, 'Over') ? 'selected' : ''}`}
                      onClick={() => onQuickBet(match, 'Over', markets.overOdds, `Over ${markets.totalRuns}`)}
                    >
                      <span className="srl-ou-btn__label">Over {markets.totalRuns}</span>
                      <strong>{Number(markets.overOdds).toFixed(2)}</strong>
                    </button>
                    <button
                      type="button"
                      className={`srl-ou-btn ${isBetSelected(match.id, 'Under') ? 'selected' : ''}`}
                      onClick={() => onQuickBet(match, 'Under', markets.underOdds, `Under ${markets.totalRuns}`)}
                    >
                      <span className="srl-ou-btn__label">Under {markets.totalRuns}</span>
                      <strong>{Number(markets.underOdds).toFixed(2)}</strong>
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  className="srl-match-card__more"
                  onClick={() => onSelectMatch(match.id)}
                >
                  +{extra}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
