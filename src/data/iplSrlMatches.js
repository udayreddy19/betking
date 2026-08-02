/** Simulated Reality League — Indian Premier League SRL fixtures. */

export const IPL_SRL_LEAGUE = 'Indian Premier League SRL';
export const IPL_SRL_BREADCRUMB = 'Simulated Reality League - Indian Premier League SRL';

const IPL_SRL_TEAMS = {
  rr: { name: 'Rajasthan Royals SRL', shortName: 'RR', color: '#e91e63' },
  dc: { name: 'Delhi Capitals SRL', shortName: 'DC', color: '#2563eb' },
  pbks: { name: 'Punjab Kings SRL', shortName: 'PBKS', color: '#dc2626' },
  gt: { name: 'Gujarat Titans SRL', shortName: 'GT', color: '#1d4ed8' },
  mi: { name: 'Mumbai Indians SRL', shortName: 'MI', color: '#3b82f6' },
  kkr: { name: 'Kolkata Knight Riders SRL', shortName: 'KKR', color: '#7c3aed' },
  srh: { name: 'Sunrisers Hyderabad SRL', shortName: 'SRH', color: '#f97316' },
  lsg: { name: 'Lucknow Super Giants SRL', shortName: 'LSG', color: '#0d9488' },
  csk: { name: 'Chennai Super Kings SRL', shortName: 'CSK', color: '#facc15' },
};

function srlMatch({
  id,
  team1Key,
  team2Key,
  time,
  isLive,
  matchState,
  liveDetails,
  odds,
  totalLine,
  totalOdds,
  extraMarkets,
}) {
  return {
    id,
    league: IPL_SRL_LEAGUE,
    seriesName: IPL_SRL_LEAGUE,
    sport: 'cricket',
    source: 'srl',
    sportColor: '#f97316',
    time,
    isLive: !!isLive,
    matchState,
    team1: IPL_SRL_TEAMS[team1Key],
    team2: IPL_SRL_TEAMS[team2Key],
    odds,
    liveDetails,
    srlMarkets: totalLine != null ? {
      totalRuns: totalLine,
      overOdds: totalOdds?.over ?? 1.85,
      underOdds: totalOdds?.under ?? 1.85,
    } : null,
    extraMarkets: extraMarkets ?? 24,
  };
}

/** Seed fixtures when API has no SRL data — matches 10CRIC IPL SRL layout. */
export function getIplSrlMatches() {
  return [
    srlMatch({
      id: 'srl_ipl_rr_dc',
      team1Key: 'rr',
      team2Key: 'dc',
      time: 'Live',
      isLive: true,
      matchState: 'in',
      odds: { team1: 1.90, team2: 1.84 },
      totalLine: 181.5,
      totalOdds: { over: 1.85, under: 1.85 },
      extraMarkets: 30,
      liveDetails: {
        runs: 6,
        wickets: 0,
        overs: '0.4',
        firstRuns: 6,
        firstWickets: 0,
        firstOvers: '0.4',
        firstTeamName: 'Rajasthan Royals SRL',
        score2: 0,
        wickets2: 0,
        overs2: '0.0',
        inningsId: 1,
        commentary: 'Rajasthan Royals SRL batting',
      },
    }),
    srlMatch({
      id: 'srl_ipl_pbks_gt',
      team1Key: 'pbks',
      team2Key: 'gt',
      time: '02 Aug - 22:30',
      matchState: 'pre',
      odds: { team1: 1.98, team2: 1.77 },
      extraMarkets: 24,
      liveDetails: { commentary: 'Scheduled' },
    }),
    srlMatch({
      id: 'srl_ipl_mi_kkr',
      team1Key: 'mi',
      team2Key: 'kkr',
      time: '03 Aug - 09:30',
      matchState: 'pre',
      odds: { team1: 1.83, team2: 1.91 },
      extraMarkets: 24,
      liveDetails: { commentary: 'Scheduled' },
    }),
    srlMatch({
      id: 'srl_ipl_srh_lsg',
      team1Key: 'srh',
      team2Key: 'lsg',
      time: '03 Aug - 14:30',
      matchState: 'pre',
      odds: { team1: 1.68, team2: 2.12 },
      extraMarkets: 24,
      liveDetails: { commentary: 'Scheduled' },
    }),
    srlMatch({
      id: 'srl_ipl_csk_rr',
      team1Key: 'csk',
      team2Key: 'rr',
      time: '03 Aug - 19:30',
      matchState: 'pre',
      odds: { team1: 2.02, team2: 1.74 },
      extraMarkets: 24,
      liveDetails: { commentary: 'Scheduled' },
    }),
  ];
}

export function isIplSrlLeague(leagueKey) {
  if (!leagueKey || leagueKey === 'all') return false;
  const key = String(leagueKey).toLowerCase();
  return key === 'ipl-srl'
    || key.includes('indian premier league srl')
    || key.includes('ipl srl');
}
