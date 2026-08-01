import { createContext, useContext, useState, useEffect } from 'react';
import { matches as initialMatches } from '../data/mockData';

const LiveSportsContext = createContext(null);

const cricketCommentaries = [
  'FOUR! Slashed over backward point with supreme timing!',
  'SIX! Magnificent strike over deep mid-wicket!',
  'WICKET! Edged and taken by the wicketkeeper!',
  '1 Run - Worked away off the pads to fine leg.',
  '2 Runs - Driven through covers, quick running between wickets.',
  'DOT BALL - Good length ball outside off, left alone.',
  'APPEAL FOR LBW! Turned down by the umpire.',
  'NO BALL! High full toss called by the square leg umpire.'
];

const soccerCommentaries = [
  'GOAL! Stunning volley into the top corner of the net!',
  'SAVED! Exceptional diving stop by the goalkeeper!',
  'CORNER KICK - Dangerous cross whipped into the 6-yard box.',
  'YELLOW CARD - Tactical foul to halt the counter-attack.',
  'Offside flag raised by the assistant referee.',
  'SHOT OFF THE POST! Inches away from doubling the lead!'
];

const basketballCommentaries = [
  '3-POINTER! Swish from downtown behind the arc!',
  'MONSTER DUNK! Explosive transition finish!',
  'AND ONE! Foul called on the drive to the rim.',
  'STEAL! Fast break opportunity on the other end.',
  'BLOCK! Rejected at the rim with authority!'
];

export function LiveSportsProvider({ children }) {
  const [matches, setMatches] = useState(() => {
    return initialMatches.map(m => {
      let liveDetails = {};
      if (m.sport === 'cricket') {
        liveDetails = {
          runs: Math.floor(Math.random() * 80) + 120,
          wickets: Math.floor(Math.random() * 5),
          overs: (Math.floor(Math.random() * 15) + 4) + '.' + Math.floor(Math.random() * 6),
          commentary: 'Match in progress - High intensity action!'
        };
      } else if (m.sport === 'soccer') {
        liveDetails = {
          score1: Math.floor(Math.random() * 3),
          score2: Math.floor(Math.random() * 2),
          minute: Math.floor(Math.random() * 70) + 15,
          commentary: 'Possession battle in midfield.'
        };
      } else if (m.sport === 'basketball') {
        liveDetails = {
          score1: Math.floor(Math.random() * 40) + 60,
          score2: Math.floor(Math.random() * 40) + 60,
          quarter: '3rd Qtr',
          commentary: 'High scoring clash!'
        };
      } else {
        liveDetails = {
          score1: Math.floor(Math.random() * 5),
          score2: Math.floor(Math.random() * 5),
          commentary: 'Rally in progress!'
        };
      }

      return {
        ...m,
        liveDetails,
        oddsDirection: { team1: null, team2: null, draw: null }
      };
    });
  });

  const [tickerMessage, setTickerMessage] = useState('🔴 LIVE BETTING AUTOMATION ACTIVE - Odds & Scores updated in real time');

  // Automation loop: updates odds and match details dynamically every 2.5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setMatches(prevMatches => {
        return prevMatches.map(match => {
          if (!match.isLive && Math.random() > 0.85) {
            // Randomly turn an upcoming match to LIVE!
            return {
              ...match,
              isLive: true,
              liveDetails: {
                runs: 12,
                wickets: 0,
                overs: '1.2',
                commentary: 'Match just kicked off live!'
              }
            };
          }

          if (!match.isLive) return match;

          // 1. Odds Fluctuation
          const team1Delta = (Math.random() * 0.14 - 0.07);
          const team2Delta = (Math.random() * 0.14 - 0.07);

          const newOdds1 = Math.max(1.05, +(match.odds.team1 + team1Delta).toFixed(2));
          const newOdds2 = Math.max(1.05, +(match.odds.team2 + team2Delta).toFixed(2));

          let newDrawOdds = match.odds.draw;
          let drawDir = null;
          if (match.odds.draw !== undefined) {
            const drawDelta = (Math.random() * 0.12 - 0.06);
            newDrawOdds = Math.max(1.50, +(match.odds.draw + drawDelta).toFixed(2));
            drawDir = drawDelta > 0 ? 'up' : 'down';
          }

          // 2. Score & Commentary updates
          let updatedDetails = { ...match.liveDetails };
          let eventCommentary = match.liveDetails?.commentary;

          if (match.sport === 'cricket' && Math.random() > 0.4) {
            const runAdd = [0, 1, 2, 4, 6][Math.floor(Math.random() * 5)];
            const isWicket = Math.random() < 0.08;
            const updatedRuns = (updatedDetails.runs || 120) + runAdd;
            const updatedWickets = isWicket ? Math.min(10, (updatedDetails.wickets || 2) + 1) : (updatedDetails.wickets || 2);
            
            const commList = cricketCommentaries;
            eventCommentary = commList[Math.floor(Math.random() * commList.length)];

            updatedDetails = {
              ...updatedDetails,
              runs: updatedRuns,
              wickets: updatedWickets,
              commentary: eventCommentary
            };
          } else if (match.sport === 'soccer' && Math.random() > 0.5) {
            const minuteAdd = Math.floor(Math.random() * 2) + 1;
            const newMin = Math.min(90, (updatedDetails.minute || 30) + minuteAdd);
            const isGoal = Math.random() < 0.06;
            let score1 = updatedDetails.score1 || 0;
            let score2 = updatedDetails.score2 || 0;

            if (isGoal) {
              if (Math.random() > 0.5) score1 += 1;
              else score2 += 1;
              eventCommentary = '⚽ GOAL SCORED! Live odds updating instantly!';
            } else {
              const commList = soccerCommentaries;
              eventCommentary = commList[Math.floor(Math.random() * commList.length)];
            }

            updatedDetails = {
              ...updatedDetails,
              minute: newMin,
              score1,
              score2,
              commentary: eventCommentary
            };
          } else if (match.sport === 'basketball' && Math.random() > 0.3) {
            const ptsAdd = [2, 3, 1][Math.floor(Math.random() * 3)];
            if (Math.random() > 0.5) updatedDetails.score1 = (updatedDetails.score1 || 80) + ptsAdd;
            else updatedDetails.score2 = (updatedDetails.score2 || 80) + ptsAdd;

            const commList = basketballCommentaries;
            eventCommentary = commList[Math.floor(Math.random() * commList.length)];
            updatedDetails.commentary = eventCommentary;
          }

          // Update Ticker Message
          if (eventCommentary && eventCommentary.includes('GOAL') || eventCommentary.includes('SIX') || eventCommentary.includes('WICKET')) {
            setTickerMessage(`⚡ [LIVE UPDATE] ${match.team1.shortName} vs ${match.team2.shortName}: ${eventCommentary}`);
          }

          return {
            ...match,
            odds: {
              ...match.odds,
              team1: newOdds1,
              team2: newOdds2,
              ...(newDrawOdds !== undefined ? { draw: newDrawOdds } : {})
            },
            oddsDirection: {
              team1: team1Delta > 0 ? 'up' : 'down',
              team2: team2Delta > 0 ? 'up' : 'down',
              draw: drawDir
            },
            liveDetails: updatedDetails
          };
        });
      });
    }, 2500);

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
  if (!context) {
    throw new Error('useLiveSports must be used within a LiveSportsProvider');
  }
  return context;
}
