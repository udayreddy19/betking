import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getIplSrlSchedule, IPL_SRL_LEAGUE } from '../../data/iplSrlMatches';
import { getSrlHomeBanner, SRL_LAUNCH_LABEL } from '../../data/oddsyraSrlSeason';
import { useLiveMatches } from '../../context/LiveSportsContext';
import { useBetSlip } from '../../context/BetSlipContext';
import { isIplSrlMatch } from '../../data/iplSrlMatches';
import { getMatchState } from '../../utils/matchBetting';
import { teamDisplayName } from '../../utils/teamShortName';
import TeamJersey from '../../components/TeamJersey/TeamJersey';
import SrlLeaguePanel from '../../components/SrlLeaguePanel/SrlLeaguePanel';
import './OddsYraSrl.css';

const TABS = [
  { id: 'matches', label: 'Matches' },
  { id: 'schedule', label: 'Schedule' },
];

function statusLabel(match) {
  const state = getMatchState(match);
  if (state === 'in') return 'Live';
  if (state === 'post') return 'Completed';
  return match.scheduleLabel || match.time || 'Upcoming';
}

export default function OddsYraSrl() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === searchParams.get('tab')) ? searchParams.get('tab') : 'matches';
  const liveMatches = useLiveMatches();
  const { addBet, isBetSelected } = useBetSlip();
  const [now, setNow] = useState(() => Date.now());
  const banner = getSrlHomeBanner(now);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(id);
  }, []);

  const boardMatches = useMemo(
    () => (liveMatches || []).filter(isIplSrlMatch),
    [liveMatches],
  );

  const schedule = useMemo(() => getIplSrlSchedule(now, 16), [now]);

  const openMatch = (matchId) => {
    navigate(`/sports?league=ipl-srl&match=${encodeURIComponent(matchId)}`);
  };

  const quickBet = (match, selection, odds, selectionName) => {
    if (!(Number(odds) > 1)) return;
    addBet(match, selection, odds, selectionName, {
      marketName: 'Match Winner',
      marketId: 'match_winner',
      silentAdd: true,
    });
  };

  return (
    <div className="srl-page container" id="oddsyra-srl-page">
      <nav className="srl-page-crumb" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span aria-hidden="true">/</span>
        <span>OddsYra SRL</span>
      </nav>

      <header className="srl-page-hero">
        <p className="srl-page-kicker">{banner.kicker}</p>
        <h1>{banner.title}</h1>
        <p className="srl-page-lead">{banner.subtitle}</p>
        <p className="srl-page-note">
          OddsYra SRL is our own simulated T20 league. There is no Cricbuzz or 10Cric feed —
          scores, schedule, and markets are generated here. Season start: {SRL_LAUNCH_LABEL}.
        </p>
        <div className="srl-page-hero-actions">
          <Link className="srl-page-cta" to="/sports?league=ipl-srl">Bet on SRL</Link>
          <button
            type="button"
            className="srl-page-cta srl-page-cta--ghost"
            onClick={() => setSearchParams({ tab: 'schedule' })}
          >
            Full schedule
          </button>
        </div>
      </header>

      <div className="srl-page-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`srl-page-tab ${tab === t.id ? 'is-active' : ''}`}
            onClick={() => setSearchParams({ tab: t.id })}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'matches' && (
        <SrlLeaguePanel
          matches={boardMatches}
          onSelectMatch={openMatch}
          onQuickBet={quickBet}
          isBetSelected={isBetSelected}
        />
      )}

      {tab === 'schedule' && (
        <section className="srl-schedule" aria-label={`${IPL_SRL_LEAGUE} schedule`}>
          <h2 className="srl-schedule-title">{IPL_SRL_LEAGUE} fixture list</h2>
          <ul className="srl-schedule-list">
            {schedule.map((match) => {
              const state = getMatchState(match);
              return (
                <li key={match.id}>
                  <button
                    type="button"
                    className={`srl-schedule-row ${state === 'in' ? 'is-live' : ''}`}
                    onClick={() => openMatch(match.id)}
                  >
                    <span className={`srl-schedule-status srl-schedule-status--${state}`}>
                      {statusLabel(match)}
                    </span>
                    <span className="srl-schedule-teams">
                      <span className="srl-schedule-team">
                        <TeamJersey team={match.team1} size={22} />
                        {teamDisplayName(match.team1)}
                      </span>
                      <span className="srl-schedule-vs">vs</span>
                      <span className="srl-schedule-team">
                        <TeamJersey team={match.team2} size={22} />
                        {teamDisplayName(match.team2)}
                      </span>
                    </span>
                    <span className="srl-schedule-when">{match.scheduleLabel || match.time}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
