import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  getIplSrlPointsTable,
  getIplSrlSeasonMatches,
  IPL_SRL_LEAGUE,
  SRL_SEASON_MATCH_COUNT,
  isIplSrlMatch,
} from '../../data/iplSrlMatches';
import { getSrlHomeBanner, SRL_LAUNCH_LABEL } from '../../data/oddsyraSrlSeason';
import { useLiveMatches } from '../../context/LiveSportsContext';
import { useBetSlip } from '../../context/BetSlipContext';
import { getMatchState } from '../../utils/matchBetting';
import { teamDisplayName } from '../../utils/teamShortName';
import TeamJersey from '../../components/TeamJersey/TeamJersey';
import SrlLeaguePanel from '../../components/SrlLeaguePanel/SrlLeaguePanel';
import './OddsYraSrl.css';

const TABS = [
  { id: 'matches', label: 'Matches' },
  { id: 'points', label: 'Points table' },
  { id: 'schedule', label: 'Schedule' },
];

function fixtureState(match) {
  return match.matchState || getMatchState(match);
}

function statusLabel(match) {
  const state = fixtureState(match);
  if (state === 'in') return 'Live';
  if (state === 'post') return 'Result';
  return 'Upcoming';
}

function resultText(match) {
  const state = fixtureState(match);
  if (state === 'post') return match.liveDetails?.resultSummary || match.liveDetails?.commentary || 'Completed';
  if (state === 'in') return 'In play';
  return match.scheduleLabel || match.time || '—';
}

function formatNrr(nrr) {
  const n = Number(nrr) || 0;
  const body = Math.abs(n).toFixed(3);
  return n >= 0 ? `+${body}` : `-${body}`;
}

export default function OddsYraSrl() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === searchParams.get('tab')) ? searchParams.get('tab') : 'matches';
  const stageFilter = searchParams.get('stage') === 'playoffs' ? 'playoffs' : searchParams.get('stage') === 'league' ? 'league' : 'all';
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

  const season = useMemo(() => getIplSrlSeasonMatches(now), [now]);
  const table = useMemo(() => getIplSrlPointsTable(now), [now]);
  const scheduleRows = useMemo(() => {
    if (stageFilter === 'playoffs') return season.filter((m) => m.playoff);
    if (stageFilter === 'league') return season.filter((m) => !m.playoff);
    return season;
  }, [season, stageFilter]);

  const openMatch = (matchId, locked = true) => {
    if (!locked) return;
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

  const setTab = (id) => setSearchParams({ tab: id });

  return (
    <div className="srl-page container" id="oddsyra-srl-page">
      <nav className="srl-page-crumb" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span aria-hidden="true">/</span>
        <span>OddsYra SRL</span>
      </nav>

      <header className="srl-page-hero">
        <div className="srl-page-hero-copy">
          <p className="srl-page-kicker">{banner.kicker}</p>
          <h1>{banner.title}</h1>
          <p className="srl-page-lead">{banner.subtitle}</p>
          <p className="srl-page-note">
            Full IPL structure: {SRL_SEASON_MATCH_COUNT} matches — 70 league games, then Qualifier 1,
            Eliminator, Qualifier 2, and the Final. Points, NRR, and playoff teams update as results come in.
          </p>
          <div className="srl-page-hero-actions">
            <Link className="srl-page-cta" to="/sports?league=ipl-srl">Bet on SRL</Link>
            <button type="button" className="srl-page-cta srl-page-cta--ghost" onClick={() => setTab('schedule')}>
              Full schedule
            </button>
          </div>
        </div>
        <div className="srl-page-hero-aside" aria-hidden="true">
          <strong>{SRL_LAUNCH_LABEL}</strong>
          <span>Season start · 74 matches</span>
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
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'matches' && (
        <>
          <SrlLeaguePanel
            matches={boardMatches}
            onSelectMatch={(id) => openMatch(id)}
            onQuickBet={quickBet}
            isBetSelected={isBetSelected}
          />
          <section className="srl-table-wrap" aria-label="Upcoming and recent SRL fixtures">
            <h2 className="srl-schedule-title">Fixture table</h2>
            <FixtureTable
              rows={season}
              onOpen={openMatch}
              compact
            />
          </section>
        </>
      )}

      {tab === 'points' && (
        <section className="srl-table-wrap" aria-label={`${IPL_SRL_LEAGUE} points table`}>
          <h2 className="srl-schedule-title">Points table</h2>
          <div className="srl-table-scroll">
            <table className="srl-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Team</th>
                  <th>P</th>
                  <th>W</th>
                  <th>L</th>
                  <th>Pts</th>
                  <th>NRR</th>
                </tr>
              </thead>
              <tbody>
                {table.map((row) => (
                  <tr key={row.key} className={row.rank <= 4 ? 'is-playoff' : undefined}>
                    <td>{row.rank}</td>
                    <td>
                      <span className="srl-table-team">
                        <TeamJersey team={{ name: row.name, shortName: row.shortName, key: row.key }} size={22} />
                        <span>
                          <strong>{row.shortName}</strong>
                          <span className="srl-table-muted"> {teamDisplayName({ name: row.name, shortName: row.shortName })}</span>
                        </span>
                      </span>
                    </td>
                    <td>{row.played}</td>
                    <td>{row.won}</td>
                    <td>{row.lost}</td>
                    <td><strong>{row.points}</strong></td>
                    <td>{formatNrr(row.nrr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="srl-table-footnote">Top four qualify. Qualifier 1: 1st vs 2nd. Eliminator: 3rd vs 4th.</p>
        </section>
      )}

      {tab === 'schedule' && (
        <section className="srl-table-wrap" aria-label={`${IPL_SRL_LEAGUE} schedule`}>
          <div className="srl-schedule-head">
            <h2 className="srl-schedule-title">{IPL_SRL_LEAGUE} · {SRL_SEASON_MATCH_COUNT} matches</h2>
            <div className="srl-stage-filters">
              {[
                { id: 'all', label: 'All' },
                { id: 'league', label: 'League (70)' },
                { id: 'playoffs', label: 'Playoffs (4)' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`srl-page-tab ${stageFilter === f.id ? 'is-active' : ''}`}
                  onClick={() => setSearchParams({ tab: 'schedule', stage: f.id })}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <FixtureTable rows={scheduleRows} onOpen={openMatch} />
        </section>
      )}
    </div>
  );
}

function FixtureTable({ rows, onOpen, compact = false }) {
  const upcoming = rows.filter((m) => fixtureState(m) !== 'post');
  const visible = compact
    ? (upcoming.length ? upcoming.slice(0, 16) : rows.slice(-8))
    : rows;

  return (
    <div className="srl-table-scroll">
      <table className="srl-table srl-table--fixtures">
        <thead>
          <tr>
            <th>#</th>
            <th>Stage</th>
            <th>Home</th>
            <th>Away</th>
            <th>When</th>
            <th>Status</th>
            <th>Result / time</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((match) => {
            const state = fixtureState(match);
            const locked = match.teamsLocked !== false && match.team1?.key !== 'tbd';
            return (
              <tr
                key={match.id}
                className={`${state === 'in' ? 'is-live' : ''} ${match.playoff ? 'is-playoff' : ''}`}
                onClick={() => onOpen(match.id, locked)}
              >
                <td>{match.matchNo || '—'}</td>
                <td>{match.stageLabel || 'League'}</td>
                <td>
                  <span className="srl-table-team">
                    <TeamJersey team={match.team1} size={20} />
                    {match.team1?.shortName || teamDisplayName(match.team1)}
                  </span>
                </td>
                <td>
                  <span className="srl-table-team">
                    <TeamJersey team={match.team2} size={20} />
                    {match.team2?.shortName || teamDisplayName(match.team2)}
                  </span>
                </td>
                <td>{match.scheduleLabel || match.time}</td>
                <td>
                  <span className={`srl-schedule-status srl-schedule-status--${state}`}>
                    {statusLabel(match)}
                  </span>
                </td>
                <td>{resultText(match)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
