import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { matches as defaultMatches } from '../data/mockData';
import { getStableMatchOdds, safeNum } from '../utils/odds';

const LiveSportsContext = createContext(null);

export function LiveSportsProvider({ children }) {
  const [matches, setMatches] = useState(defaultMatches);
  const [tickerMessage, setTickerMessage] = useState('🟢 Connecting to ESPN Live Feed...');
  const oddsCacheRef = useRef(new Map());

  useEffect(() => {
    const fetchLiveScores = async () => {
      try {
        // ── ESPN API endpoints (CORS-safe, free, no key needed) ──
        const endpoints = [
          { url: 'https://site.api.espn.com/apis/site/v2/sports/cricket/8048/scoreboard', sport: 'cricket' },
          { url: 'https://site.api.espn.com/apis/site/v2/sports/cricket/15414/scoreboard', sport: 'cricket' },
          { url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard', sport: 'soccer' },
          { url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard', sport: 'soccer' },
          { url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/ger.1/scoreboard', sport: 'soccer' },
        ];

        const results = await Promise.allSettled(endpoints.map(e => fetch(e.url)));

        const cricketEvents = [];
        const soccerEvents = [];

        for (let i = 0; i < results.length; i++) {
          const res = results[i];
          if (res.status !== 'fulfilled' || !res.value.ok) continue;
          const data = await res.value.json();
          const events = data.events || [];
          if (endpoints[i].sport === 'cricket') {
            cricketEvents.push(...events);
          } else {
            soccerEvents.push(...events);
          }
        }

        // ── BUILD LIVE MATCH LIST FROM API ──
        const apiMatches = [];
        let matchIdx = 0;

        // Map cricket events
        cricketEvents.forEach((evt) => {
          const comp = evt.competitions?.[0];
          const competitors = comp?.competitors || [];
          if (competitors.length < 2) return;

          const home = competitors[0];
          const away = competitors[1];
          const state = evt.status?.type?.state || 'pre'; // "pre", "in", "post"
          const statusDetail = evt.status?.type?.detail || '';
          const shortDetail = evt.status?.type?.shortDetail || '';
          const isLive = state === 'in';
          const isCompleted = state === 'post';

          // Parse scores properly — ESPN cricket score format: "161/5" or just "161"
          const homeScore = home.score || '';
          const awayScore = away.score || '';
          const [hRunsRaw, hWicketsRaw] = homeScore.includes('/') ? homeScore.split('/').map(Number) : [parseInt(homeScore, 10), 0];
          const [aRunsRaw, aWicketsRaw] = awayScore.includes('/') ? awayScore.split('/').map(Number) : [parseInt(awayScore, 10), 0];
          const hRuns = safeNum(hRunsRaw);
          const hWickets = safeNum(hWicketsRaw);
          const aRuns = safeNum(aRunsRaw);
          const aWickets = safeNum(aWicketsRaw);

          // Extract overs from shortDetail — e.g. "In Progress - BIR 145/3 (19.4 Ov)"
          let overs = '0.0';
          const ovMatch = shortDetail.match(/\(([0-9.]+)\s*[Oo]v/);
          if (ovMatch) overs = ovMatch[1];
          // Also try from statusDetail
          if (overs === '0.0') {
            const ovMatch2 = statusDetail.match(/\(([0-9.]+)\s*[Oo]v/);
            if (ovMatch2) overs = ovMatch2[1];
          }

          const homeName = home.team?.displayName || 'Team A';
          const awayName = away.team?.displayName || 'Team B';
          const homeShort = home.team?.abbreviation || homeName.slice(0, 3).toUpperCase();
          const awayShort = away.team?.abbreviation || awayName.slice(0, 3).toUpperCase();
          const leagueName = comp?.name || evt.name || evt.shortName || 'Cricket';

          matchIdx++;
          const matchId = `api_cric_${evt.id || matchIdx}`;
          if (!oddsCacheRef.current.has(matchId)) {
            oddsCacheRef.current.set(matchId, getStableMatchOdds(matchId));
          }
          const odds = oddsCacheRef.current.get(matchId);

          // Time display
          let timeDisplay = 'Scheduled';
          if (isLive) timeDisplay = 'Live';
          else if (isCompleted) timeDisplay = 'Completed';
          else {
            const matchDate = new Date(evt.date);
            const now = new Date();
            const diffMs = matchDate - now;
            if (diffMs > 0 && diffMs < 86400000) {
              timeDisplay = `Today ${matchDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
            } else if (diffMs > 0 && diffMs < 172800000) {
              timeDisplay = `Tomorrow ${matchDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
            }
          }

          apiMatches.push({
            id: matchId,
            league: leagueName,
            sport: 'cricket',
            sportColor: '#f97316',
            time: timeDisplay,
            isLive,
            matchState: state,
            team1: { name: homeName, shortName: homeShort, color: '#22c55e' },
            team2: { name: awayName, shortName: awayShort, color: '#e5e7eb' },
            odds,
            liveDetails: {
              runs: hRuns,
              wickets: hWickets,
              overs: overs,
              score2: aRuns,
              wickets2: aWickets,
              overs2: '20.0',
              commentary: statusDetail,
              // Derived stats proportional to actual score
              fours: Math.max(0, Math.floor(hRuns / 14)),
              sixes: Math.max(0, Math.floor(hRuns / 30)),
              extras: Math.max(0, Math.floor(hRuns / 18)),
              batter1: {
                name: homeName.split(' ')[0] + ' Striker',
                runs: Math.floor(hRuns * 0.38),
                balls: Math.max(1, Math.floor(parseFloat(overs) * 6 * 0.4)),
                fours: Math.max(0, Math.floor(hRuns * 0.04)),
                sixes: Math.max(0, Math.floor(hRuns * 0.02))
              },
              batter2: {
                name: homeName.split(' ')[0] + ' Non-Striker',
                runs: Math.floor(hRuns * 0.22),
                balls: Math.max(1, Math.floor(parseFloat(overs) * 6 * 0.3)),
                fours: Math.max(0, Math.floor(hRuns * 0.02)),
                sixes: Math.max(0, Math.floor(hRuns * 0.01))
              },
              bowler: { name: awayName.split(' ')[0] + ' Bowler' },
              ballHistory: ['1', '•', '4', '1', '2', 'W', '1', '4']
            }
          });
        });

        // Map soccer events
        soccerEvents.forEach((evt) => {
          const comp = evt.competitions?.[0];
          const competitors = comp?.competitors || [];
          if (competitors.length < 2) return;

          const home = competitors.find(c => c.homeAway === 'home') || competitors[0];
          const away = competitors.find(c => c.homeAway === 'away') || competitors[1];
          const state = evt.status?.type?.state || 'pre';
          const statusDetail = evt.status?.type?.detail || '';
          const isLive = state === 'in';
          const isCompleted = state === 'post';
          const clock = evt.status?.displayClock || '';
          const period = evt.status?.period || 0;

          const homeName = home.team?.displayName || 'Home';
          const awayName = away.team?.displayName || 'Away';
          const homeShort = home.team?.abbreviation || homeName.slice(0, 3).toUpperCase();
          const awayShort = away.team?.abbreviation || awayName.slice(0, 3).toUpperCase();

          let timeDisplay = 'Scheduled';
          if (isLive) timeDisplay = 'Live';
          else if (isCompleted) timeDisplay = 'FT';
          else {
            const matchDate = new Date(evt.date);
            const now = new Date();
            const diffMs = matchDate - now;
            if (diffMs > 0 && diffMs < 86400000) {
              timeDisplay = `Today ${matchDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
            } else if (diffMs > 0 && diffMs < 172800000) {
              timeDisplay = `Tomorrow ${matchDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
            }
          }

          matchIdx++;
          const soccerMatchId = `api_soc_${evt.id || matchIdx}`;
          if (!oddsCacheRef.current.has(soccerMatchId)) {
            oddsCacheRef.current.set(soccerMatchId, getStableMatchOdds(soccerMatchId, { hasDraw: true }));
          }
          const soccerOdds = oddsCacheRef.current.get(soccerMatchId);

          apiMatches.push({
            id: soccerMatchId,
            league: comp?.name || evt.name || 'Soccer',
            sport: 'soccer',
            sportColor: '#22c55e',
            time: timeDisplay,
            isLive,
            matchState: state,
            team1: { name: homeName, shortName: homeShort, color: '#6cb4ee' },
            team2: { name: awayName, shortName: awayShort, color: '#ef4444' },
            odds: soccerOdds,
            liveDetails: {
              score1: safeNum(parseInt(home.score, 10)),
              score2: safeNum(parseInt(away.score, 10)),
              minute: isLive ? `${clock}' ${period >= 2 ? '2nd Half' : '1st Half'}` : (isCompleted ? 'Full Time' : 'Scheduled'),
              commentary: statusDetail
            }
          });
        });

        // Merge API data with demo bettable matches so users can always place bets
        if (apiMatches.length > 0) {
          const coveredSports = new Set(apiMatches.map(m => m.sport));
          const uncoveredDefaults = defaultMatches.filter(m => !coveredSports.has(m.sport));
          const demoBettable = defaultMatches.filter(m => m.matchState === 'in' || m.matchState === 'pre');
          const apiPairKeys = new Set(apiMatches.map(m => `${m.team1.name}|${m.team2.name}`));
          const uniqueDemo = demoBettable.filter(m => !apiPairKeys.has(`${m.team1.name}|${m.team2.name}`));
          setMatches([...uniqueDemo, ...apiMatches, ...uncoveredDefaults]);
        }

        setTickerMessage(
          `🟢 LIVE ESPN API ACTIVE — ${apiMatches.length} real events synced (${cricketEvents.length} cricket, ${soccerEvents.length} soccer)`
        );
      } catch (err) {
        console.warn('Live score fetch error:', err);
        setTickerMessage('⚠️ API fetch temporarily unavailable — using cached data');
      }
    };

    fetchLiveScores();
    const interval = setInterval(fetchLiveScores, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <LiveSportsContext.Provider value={{ matches, tickerMessage }}>
      {children}
    </LiveSportsContext.Provider>
  );
}

export function useLiveSports() {
  const context = useContext(LiveSportsContext);
  if (!context) throw new Error('useLiveSports must be used within LiveSportsProvider');
  return context;
}
