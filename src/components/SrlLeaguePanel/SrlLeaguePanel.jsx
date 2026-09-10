import TeamJersey from '../TeamJersey/TeamJersey';
import { getMatchState, isTrulyLiveMatch } from '../../utils/matchBetting';
import { resolveCricketTeamScores, isCricketSecondInnings, teamNameMatches, resolveCricketTossText } from '../../utils/cricketScores';
import { isTeamBattingInMatch } from '../../utils/teamFlags';
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

function findCardMarket(match, marketId) {
  return (match?.engineCardMarkets || []).find((m) => m.marketId === marketId && m.status === 'OPEN') || null;
}

function fmtOdds(n) {
  const v = Number(n);
  return v > 1 ? v.toFixed(2) : '—';
}

function resultLine(match) {
  return match?.liveDetails?.resultSummary
    || match?.liveDetails?.commentary
    || 'Completed';
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
        <p>No OddsYra SRL matches right now.</p>
      </div>
    );
  }

  const liveUpcoming = matches.filter((m) => getMatchState(m) !== 'post');
  const completed = matches.filter((m) => getMatchState(m) === 'post');

  const renderCard = (match) => {
    const state = getMatchState(match);
    const isLive = isTrulyLiveMatch(match);
    const isFinished = state === 'post';
    const markets = match.srlMarkets;
    const tossMkt = !isLive && !isFinished ? findCardMarket(match, 'toss_winner') : null;
    const extra = match.extraMarkets ?? 24;
    const t1Odds = Number(match.odds?.team1);
    const t2Odds = Number(match.odds?.team2);
    const showScores = isLive || isFinished;

    return (
      <article
        key={match.id}
        className={`srl-match-card${isLive ? ' srl-match-card--live' : ''}${isFinished ? ' srl-match-card--completed' : ''}`}
      >
        <div className="srl-match-card__top">
          <span className="srl-match-card__league">{IPL_SRL_LEAGUE}</span>
          {(() => {
            const tossText = resolveCricketTossText(match);
            if (!tossText || isFinished) return null;
            return (
              <span className="srl-match-card__toss">
                {tossText}
              </span>
            );
          })()}
          {isLive ? (
            <span className="srl-match-card__innings">{inningsLabel(match)}</span>
          ) : isFinished ? (
            <span className="srl-match-card__time">Result</span>
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
            <TeamJersey team={match.team1} size={36} isFlying={isLive && isTeamBattingInMatch(match, match.team1)} />
            <span className="srl-match-card__team-name">{match.team1.name}</span>
            {showScores && (
              <strong className="srl-match-card__score">
                {teamScoreLine(match, match.team1.name, 1)}
              </strong>
            )}
          </div>
          <div className="srl-match-card__team">
            <TeamJersey team={match.team2} size={36} isFlying={isLive && isTeamBattingInMatch(match, match.team2)} />
            <span className="srl-match-card__team-name">{match.team2.name}</span>
            {showScores && (
              <strong className="srl-match-card__score">
                {teamScoreLine(match, match.team2.name, 2)}
              </strong>
            )}
          </div>
          {isFinished && (
            <p className="srl-match-card__result">{resultLine(match)}</p>
          )}
        </button>

        {isFinished ? (
          <div className="srl-match-card__markets">
            <button
              type="button"
              className="srl-match-card__more"
              onClick={() => onSelectMatch(match.id)}
            >
              View scorecard
            </button>
          </div>
        ) : (
          <div className="srl-match-card__markets">
            {tossMkt?.selections?.length >= 2 && (
              <div className="srl-match-card__odds-row srl-match-card__odds-row--toss">
                <span className="srl-match-card__strip-label">Toss</span>
                {tossMkt.selections.map((sel) => (
                  <button
                    key={sel.selectionId}
                    type="button"
                    className={`srl-odds-btn ${isBetSelected(match.id, sel.selectionId) ? 'selected' : ''}`}
                    onClick={() => onQuickBet(
                      match,
                      sel.selectionId,
                      sel.odds,
                      sel.name,
                      'toss_winner',
                    )}
                  >
                    <span>{sel.name?.split(' ').pop() || sel.name}</span>
                    <strong>{fmtOdds(sel.odds)}</strong>
                  </button>
                ))}
              </div>
            )}

            <div className="srl-match-card__odds-row">
              <span className="srl-match-card__strip-label">Winner</span>
              <button
                type="button"
                className={`srl-odds-btn ${isBetSelected(match.id, '1') ? 'selected' : ''}`}
                onClick={() => onQuickBet(match, '1', t1Odds, match.team1.name, 'match_winner')}
              >
                <span>1</span>
                <strong>{fmtOdds(t1Odds)}</strong>
              </button>
              <button
                type="button"
                className={`srl-odds-btn ${isBetSelected(match.id, '2') ? 'selected' : ''}`}
                onClick={() => onQuickBet(match, '2', t2Odds, match.team2.name, 'match_winner')}
              >
                <span>2</span>
                <strong>{fmtOdds(t2Odds)}</strong>
              </button>
            </div>

            {markets?.totalRuns != null && (
              <div className="srl-match-card__ou-row">
                <span className="srl-match-card__strip-label">Total</span>
                <button
                  type="button"
                  className={`srl-ou-btn ${isBetSelected(match.id, 'Over') ? 'selected' : ''}`}
                  onClick={() => onQuickBet(
                    match,
                    'Over',
                    markets.overOdds,
                    `Over ${markets.totalRuns}`,
                    'match_total',
                  )}
                >
                  <span className="srl-ou-btn__label">Over {markets.totalRuns}</span>
                  <strong>{fmtOdds(markets.overOdds)}</strong>
                </button>
                <button
                  type="button"
                  className={`srl-ou-btn ${isBetSelected(match.id, 'Under') ? 'selected' : ''}`}
                  onClick={() => onQuickBet(
                    match,
                    'Under',
                    markets.underOdds,
                    `Under ${markets.totalRuns}`,
                    'match_total',
                  )}
                >
                  <span className="srl-ou-btn__label">Under {markets.totalRuns}</span>
                  <strong>{fmtOdds(markets.underOdds)}</strong>
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
        )}
      </article>
    );
  };

  return (
    <div className="srl-league-panel">
      <header className="srl-league-panel__header">
        <h2 className="srl-league-panel__title">{IPL_SRL_LEAGUE}</h2>
      </header>

      {liveUpcoming.length > 0 && (
        <div className="srl-league-panel__list">
          {liveUpcoming.map(renderCard)}
        </div>
      )}

      {completed.length > 0 && (
        <section className="srl-league-panel__history" aria-label="Recent SRL results">
          <h3 className="srl-league-panel__history-title">Recent results</h3>
          <div className="srl-league-panel__list">
            {completed.map(renderCard)}
          </div>
        </section>
      )}
    </div>
  );
}
