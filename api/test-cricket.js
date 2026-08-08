/**
 * Vercel Serverless Function & REST API Endpoint for Test Cricket Scoring Engine.
 * Exposes endpoints:
 * - GET /api/v1/test-cricket?view=live (Live Snapshot)
 * - GET /api/v1/test-cricket?view=scorecard (Full 4-Innings Scorecard)
 * - GET /api/v1/test-cricket?view=summary (Day/Session Summary)
 * - GET /api/v1/test-cricket?view=commentary (Ball-by-Ball Feed)
 * - GET /api/v1/test-cricket?view=stats (Impact & Performance Metrics)
 * - GET /api/v1/test-cricket?view=timeline (Match Progression)
 */

import { TestCricketEngine } from '../lib/testCricketEngine.mjs';

// Cache single active simulation engine instance
let globalTestEngine = null;

function getOrInitTestEngine() {
  if (!globalTestEngine) {
    globalTestEngine = new TestCricketEngine({
      matchId: 'ind_vs_eng_test_2026',
      seriesName: 'ICC World Test Championship 2025-2027',
      venue: 'Lord\'s Cricket Ground, London',
      teamA: { name: 'India', shortName: 'IND', color: '#1d4ed8' },
      teamB: { name: 'England', shortName: 'ENG', color: '#dc2626' },
    });

    // Auto-initialize toss and start match
    globalTestEngine.performToss('India', 'BAT');

    // Simulate initial deliveries for realistic live data
    for (let i = 0; i < 45; i++) {
      const isWicket = i === 22 || i === 38;
      const runs = i % 4 === 0 ? 4 : (i % 6 === 0 ? 6 : (i % 2));
      globalTestEngine.deliverBall({ runs, wicket: isWicket, wicketType: isWicket ? 'caught' : null });
    }
  }
  return globalTestEngine;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const engine = getOrInitTestEngine();

  // Allow triggering new ball delivery via POST request
  if (req.method === 'POST') {
    try {
      const body = req.body || {};
      engine.deliverBall(body);
      return res.status(200).json({ success: true, live: engine.getLiveSnapshot() });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  const { view = 'live' } = req.query;

  switch (view) {
    case 'scorecard':
      return res.status(200).json(engine.getFullScorecard());
    case 'summary':
      return res.status(200).json(engine.getSessionSummary());
    case 'commentary':
      return res.status(200).json({ commentary: engine.commentary });
    case 'stats':
      return res.status(200).json({
        playerOfTheMatch: engine.playerOfTheMatch,
        fullScorecard: engine.getFullScorecard(),
      });
    case 'timeline':
      return res.status(200).json({ timeline: engine.timeline });
    case 'live':
    default:
      return res.status(200).json(engine.getLiveSnapshot());
  }
}
