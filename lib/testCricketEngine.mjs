/**
 * Production-Grade Test Cricket Scoring Engine.
 * Supports 5-Day Test matches, 4 innings, toss decisions, session management,
 * weather delays, declaration, follow-on logic, ball-by-ball calculations,
 * milestone tracking, dynamic player impact metrics, and Cricbuzz/ESPN Cricinfo style REST APIs.
 */
import { getRosterForTeam } from '../src/data/cricketRosters.js';

export const TEST_MATCH_STATES = {
  PRE_MATCH: 'PRE_MATCH',
  TOSS: 'TOSS',
  DAY_START: 'DAY_START',
  SESSION_START: 'SESSION_START',
  LIVE: 'LIVE',
  LUNCH: 'LUNCH',
  TEA: 'TEA',
  STUMPS: 'STUMPS',
  INNINGS_BREAK: 'INNINGS_BREAK',
  DECLARATION: 'DECLARATION',
  FOLLOW_ON_CHECK: 'FOLLOW_ON_CHECK',
  TARGET_CHASE: 'TARGET_CHASE',
  RESULT: 'RESULT',
  MATCH_COMPLETE: 'MATCH_COMPLETE',
  ABANDONED: 'ABANDONED',
  DRAW: 'DRAW',
  TIE: 'TIE',
  NO_RESULT: 'NO_RESULT',
};

export const SESSIONS = {
  MORNING: 'Morning',
  AFTERNOON: 'Afternoon',
  EVENING: 'Evening',
};

const OVERS_PER_DAY_TARGET = 90;
const OVERS_PER_SESSION_TARGET = 30;
const FOLLOW_ON_THRESHOLD = 200; // ICC Standard 5-day Test follow-on lead requirement

function createEmptyPlayerBatting(name, team) {
  return {
    name,
    team,
    runs: 0,
    balls: 0,
    fours: 0,
    sixes: 0,
    minutes: 0,
    strikeRate: '0.00',
    out: false,
    dismissalType: null, // 'bowled', 'caught', 'lbw', 'run_out', 'stumped', 'not_out'
    dismissalText: 'not out',
    bowlerName: null,
    fielderName: null,
    milestones: [], // [50, 100, 150, 200, 300]
  };
}

function createEmptyPlayerBowling(name, team) {
  return {
    name,
    team,
    overs: 0,
    balls: 0,
    maidens: 0,
    runs: 0,
    wickets: 0,
    economy: '0.00',
    dotBalls: 0,
    noBalls: 0,
    wides: 0,
    fiveWicketHauls: 0,
    tenWicketMatch: 0,
    currentOverBalls: [],
  };
}

function createEmptyInnings(inningsNum, batTeam, bowlTeam) {
  return {
    inningsNum,
    batTeam,
    bowlTeam,
    runs: 0,
    wickets: 0,
    overs: 0,
    balls: 0,
    oversFormatted: '0.0',
    declared: false,
    allOut: false,
    leadTrail: 0,
    target: null,
    extras: {
      byes: 0,
      legByes: 0,
      wides: 0,
      noBalls: 0,
      total: 0,
    },
    batting: {}, // name -> battingStats
    bowling: {}, // name -> bowlingStats
    partnerships: [],
    fallOfWickets: [],
    currentOver: [],
  };
}

export class TestCricketEngine {
  constructor(matchConfig = {}) {
    this.matchId = matchConfig.matchId || `test_${Date.now()}`;
    this.seriesName = matchConfig.seriesName || 'ICC World Test Championship 2025-2027';
    this.venue = matchConfig.venue || 'Lord\'s, London';
    this.teamA = matchConfig.teamA || { name: 'India', shortName: 'IND', color: '#1d4ed8' };
    this.teamB = matchConfig.teamB || { name: 'England', shortName: 'ENG', color: '#dc2626' };

    this.squads = {
      [this.teamA.name]: matchConfig.teamASquad || [
        'Rohit Sharma', 'Yashasvi Jaiswal', 'Shubman Gill', 'Virat Kohli',
        'Rishabh Pant', 'KL Rahul', 'Ravindra Jadeja', 'Ravichandran Ashwin',
        'Jasprit Bumrah', 'Mohammed Siraj', 'Akash Deep'
      ],
      [this.teamB.name]: matchConfig.teamBSquad || [
        'Zak Crawley', 'Ben Duckett', 'Ollie Pope', 'Joe Root',
        'Harry Brook', 'Ben Stokes', 'Jamie Smith', 'Chris Woakes',
        'Gus Atkinson', 'Mark Wood', 'Shoaib Bashir'
      ],
    };

    // State Machine Initial State
    this.state = TEST_MATCH_STATES.PRE_MATCH;
    this.currentDay = 1;
    this.currentSession = SESSIONS.MORNING;
    this.sessionOversBowled = 0;
    this.dayOversBowled = 0;
    this.totalOversBowled = 0;
    this.weatherStatus = 'Clear'; // 'Clear', 'Rain Delay', 'Bad Light', 'Interrupted'

    // Toss
    this.tossWinner = null;
    this.tossDecision = null; // 'BAT' or 'BOWL'

    // Innings Management (up to 4 innings)
    this.currentInningsIndex = 0; // 0 to 3 (Innings 1 to 4)
    this.inningsList = [];
    this.followOnEnforced = false;
    this.followOnEligible = false;
    this.declarationMade = false;

    // Commentary & Event Log
    this.commentary = [];
    this.timeline = [];
    this.matchLog = [];

    // Current State References
    this.currentStriker = null;
    this.currentNonStriker = null;
    this.currentBowler = null;
    this.currentPartnership = { runs: 0, balls: 0, batter1: null, batter2: null };

    this.matchResult = null;
    this.playerOfTheMatch = null;
  }

  // ── STATE MACHINE TRANSITIONS ──

  setState(nextState, reason = '') {
    const prevState = this.state;
    this.state = nextState;
    this.logEvent(`STATE_CHANGE: ${prevState} -> ${nextState} (${reason})`);
  }

  performToss(winnerTeamName, decision = 'BAT') {
    if (this.state !== TEST_MATCH_STATES.PRE_MATCH && this.state !== TEST_MATCH_STATES.TOSS) {
      throw new Error(`Cannot perform toss in state ${this.state}`);
    }

    this.tossWinner = winnerTeamName;
    this.tossDecision = decision.toUpperCase();
    this.setState(TEST_MATCH_STATES.TOSS, `${winnerTeamName} won toss and elected to ${decision}`);

    // Determine Batting Team for Innings 1
    const batTeam = this.tossDecision === 'BAT' ? this.tossWinner : (this.tossWinner === this.teamA.name ? this.teamB.name : this.teamA.name);
    const bowlTeam = batTeam === this.teamA.name ? this.teamB.name : this.teamA.name;

    this.startInnings(1, batTeam, bowlTeam);
    this.startDay(1);
    this.startSession(SESSIONS.MORNING);
    this.setState(TEST_MATCH_STATES.LIVE, 'Toss completed, play starting');

    this.addCommentary({
      type: 'TOSS',
      text: `🪙 Toss Result: ${this.tossWinner} won the toss and elected to ${this.tossDecision} first.`,
    });
  }

  startDay(dayNum) {
    this.currentDay = Math.min(5, dayNum);
    this.dayOversBowled = 0;
    this.addCommentary({
      type: 'DAY_START',
      text: `☀️ Day ${this.currentDay} of Test Match Begins. Target: 90 overs.`,
    });
    this.timeline.push({ day: this.currentDay, type: 'DAY_START', timestamp: new Date().toISOString() });
  }

  startSession(sessionName) {
    this.currentSession = sessionName;
    this.sessionOversBowled = 0;
    this.timeline.push({ day: this.currentDay, session: sessionName, type: 'SESSION_START', timestamp: new Date().toISOString() });
  }

  startInnings(inningsNum, batTeam, bowlTeam) {
    const innings = createEmptyInnings(inningsNum, batTeam, bowlTeam);
    this.inningsList.push(innings);
    this.currentInningsIndex = this.inningsList.length - 1;

    // Initialize Batters & Bowlers
    const batSquad = this.squads[batTeam] || [];
    const bowlSquad = this.squads[bowlTeam] || [];

    batSquad.forEach((name) => {
      innings.batting[name] = createEmptyPlayerBatting(name, batTeam);
    });

    bowlSquad.forEach((name) => {
      innings.bowling[name] = createEmptyPlayerBowling(name, bowlTeam);
    });

    const batRoster = getRosterForTeam(batTeam);
    const bowlRoster = getRosterForTeam(bowlTeam);

    // Set initial openers and bowler
    this.currentStriker = batSquad[0] || batRoster?.batters?.[0] || `${batTeam} Striker`;
    this.currentNonStriker = batSquad[1] || batRoster?.batters?.[1] || `${batTeam} Non-Striker`;
    this.currentBowler = bowlSquad[bowlSquad.length - 1] || bowlRoster?.bowlers?.[0] || `${bowlTeam} Bowler`;

    this.currentPartnership = {
      runs: 0,
      balls: 0,
      batter1: this.currentStriker,
      batter2: this.currentNonStriker,
    };

    this.addCommentary({
      type: 'INNINGS_START',
      text: `🏁 Innings ${inningsNum} Begins: ${batTeam} Batting. Openers: ${this.currentStriker} & ${this.currentNonStriker}.`,
    });
  }

  // ── BALL-BY-BALL ENGINE ──

  deliverBall(event = {}) {
    if (this.state !== TEST_MATCH_STATES.LIVE) {
      if (this.state === TEST_MATCH_STATES.PRE_MATCH) {
        this.performToss(this.teamA.name, 'BAT');
      } else {
        throw new Error(`Cannot deliver ball in state ${this.state}`);
      }
    }

    const innings = this.getCurrentInnings();
    if (!innings || innings.allOut || innings.declared) {
      this.checkInningsTransition();
      return;
    }

    const {
      runs = 0, // Bat runs: 0, 1, 2, 3, 4, 6
      wicket = false,
      wicketType = null, // 'bowled', 'caught', 'lbw', 'run_out', 'stumped'
      extraType = null, // 'wide', 'no_ball', 'bye', 'leg_bye'
      extraRuns = 0,
      fielder = null,
      customCommentary = '',
    } = event;

    const striker = innings.batting[this.currentStriker] || createEmptyPlayerBatting(this.currentStriker, innings.batTeam);
    const nonStriker = innings.batting[this.currentNonStriker] || createEmptyPlayerBatting(this.currentNonStriker, innings.batTeam);
    const bowler = innings.bowling[this.currentBowler] || createEmptyPlayerBowling(this.currentBowler, innings.bowlTeam);

    let ballCounted = true;
    let totalBallRuns = runs;

    // Handle Extras
    if (extraType === 'wide') {
      ballCounted = false;
      const penalty = 1 + extraRuns;
      innings.extras.wides += penalty;
      innings.extras.total += penalty;
      totalBallRuns += penalty;
      bowler.runs += penalty;
      bowler.wides += penalty;
    } else if (extraType === 'no_ball') {
      ballCounted = false;
      const penalty = 1 + runs;
      innings.extras.noBalls += 1;
      innings.extras.total += 1;
      totalBallRuns += 1; // 1 penalty run + bat runs
      bowler.runs += penalty;
      bowler.noBalls += 1;
      striker.runs += runs;
      striker.balls += 1;
      if (runs === 4) striker.fours += 1;
      if (runs === 6) striker.sixes += 1;
    } else if (extraType === 'bye') {
      const penalty = extraRuns || runs || 1;
      innings.extras.byes += penalty;
      innings.extras.total += penalty;
      totalBallRuns += penalty;
      striker.balls += 1;
    } else if (extraType === 'leg_bye') {
      const penalty = extraRuns || runs || 1;
      innings.extras.legByes += penalty;
      innings.extras.total += penalty;
      totalBallRuns += penalty;
      striker.balls += 1;
    } else {
      // Normal delivery
      striker.runs += runs;
      striker.balls += 1;
      bowler.runs += runs;
      if (runs === 0) bowler.dotBalls += 1;
      if (runs === 4) striker.fours += 1;
      if (runs === 6) striker.sixes += 1;
    }

    innings.runs += totalBallRuns;
    this.currentPartnership.runs += totalBallRuns;
    if (ballCounted) {
      innings.balls += 1;
      bowler.balls += 1;
      this.currentPartnership.balls += 1;
    }

    // Milestone Check (50, 100, 150, 200, 300)
    this.checkBattingMilestones(striker);

    // Handle Wicket
    if (wicket) {
      innings.wickets += 1;
      striker.out = true;
      striker.dismissalType = wicketType || 'caught';
      striker.dismissalText = this.formatDismissalText(striker.dismissalType, bowler.name, fielder);

      if (wicketType !== 'run_out') {
        bowler.wickets += 1;
      }

      // Record Fall of Wicket (FOW)
      innings.fallOfWickets.push({
        wicketNum: innings.wickets,
        runs: innings.runs,
        overs: this.formatOvers(innings.balls),
        batter: striker.name,
      });

      // Record Partnership
      innings.partnerships.push({
        wicket: innings.wickets,
        runs: this.currentPartnership.runs,
        balls: this.currentPartnership.balls,
        batter1: this.currentPartnership.batter1,
        batter2: this.currentPartnership.batter2,
      });

      this.addCommentary({
        type: 'WICKET',
        text: `🔴 OUT! ${striker.name} ${striker.dismissalText}. Score: ${innings.runs}/${innings.wickets}.`,
      });

      // Check for next batter or All Out
      if (innings.wickets >= 10) {
        innings.allOut = true;
        this.addCommentary({
          type: 'ALL_OUT',
          text: `💥 ALL OUT! ${innings.batTeam} completed innings at ${innings.runs} runs in ${this.formatOvers(innings.balls)} overs.`,
        });
      } else {
        const squad = this.squads[innings.batTeam] || [];
        const nextBatterName = squad[innings.wickets + 1] || `Batter ${innings.wickets + 2}`;
        this.currentStriker = nextBatterName;
        this.currentPartnership = {
          runs: 0,
          balls: 0,
          batter1: this.currentStriker,
          batter2: this.currentNonStriker,
        };
      }
    } else {
      // Strike rotation on odd runs
      if (runs % 2 === 1) {
        this.rotateStrike();
      }
    }

    // Over Completion Check
    if (ballCounted && innings.balls % 6 === 0) {
      const overNum = innings.balls / 6;
      innings.overs = overNum;
      bowler.overs = Math.floor(bowler.balls / 6);

      // Maiden Over Check
      const overBalls = bowler.currentOverBalls || [];
      const overRuns = overBalls.reduce((acc, b) => acc + (b.runs || 0), 0);
      if (overBalls.length === 6 && overRuns === 0) {
        bowler.maidens += 1;
      }
      bowler.currentOverBalls = [];

      this.sessionOversBowled += 1;
      this.dayOversBowled += 1;
      this.totalOversBowled += 1;

      // Rotate strike at end of over
      this.rotateStrike();

      // Check 5-wicket haul
      if (bowler.wickets >= 5 && !bowler.fiveWicketHauls) {
        bowler.fiveWicketHauls = 1;
        this.addCommentary({
          type: 'MILESTONE',
          text: `⭐ 5-WICKET HAUL! ${bowler.name} takes ${bowler.wickets}/${bowler.runs} for ${innings.bowlTeam}!`,
        });
      }

      // Rotate Bowler periodically
      this.rotateBowler(innings);
    }

    // Update Formatted Metrics
    innings.oversFormatted = this.formatOvers(innings.balls);
    striker.strikeRate = striker.balls > 0 ? ((striker.runs / striker.balls) * 100).toFixed(2) : '0.00';
    bowler.economy = bowler.balls > 0 ? ((bowler.runs / (bowler.balls / 6))).toFixed(2) : '0.00';

    // Add Ball Commentary
    const ballTag = wicket ? 'W' : (runs === 4 ? '4' : (runs === 6 ? '6' : String(runs)));
    this.addCommentary({
      type: wicket ? 'WICKET' : (runs >= 4 ? 'BOUNDARY' : 'BALL'),
      tag: ballTag,
      over: this.formatOvers(innings.balls),
      text: customCommentary || `${this.formatOvers(innings.balls)} ${bowler.name} to ${striker.name}, ${runs} run(s). ${wicket ? 'Wicket!' : ''}`,
    });

    // Check Session & Match Transitions
    this.checkSessionProgression();
    this.checkInningsTransition();
  }

  rotateStrike() {
    const tmp = this.currentStriker;
    this.currentStriker = this.currentNonStriker;
    this.currentNonStriker = tmp;
  }

  rotateBowler(innings) {
    const bowlSquad = this.squads[innings.bowlTeam] || [];
    const bowlers = bowlSquad.slice(6); // Bowlers in squad
    const currIdx = bowlers.indexOf(this.currentBowler);
    const nextIdx = (currIdx + 1) % bowlers.length;
    this.currentBowler = bowlers[nextIdx] || bowlers[0] || 'Bowler';
  }

  checkBattingMilestones(batter) {
    const thresholds = [50, 100, 150, 200, 300];
    thresholds.forEach((th) => {
      if (batter.runs >= th && !batter.milestones.includes(th)) {
        batter.milestones.push(th);
        const label = th === 50 ? 'FIFTY' : (th === 100 ? 'CENTURY' : (th === 200 ? 'DOUBLE CENTURY' : 'TRIPLE CENTURY'));
        this.addCommentary({
          type: 'MILESTONE',
          text: `🎉 ${label}! ${batter.name} reaches ${batter.runs}* (${batter.balls}b, ${batter.fours}x4, ${batter.sixes}x6).`,
        });
      }
    });
  }

  // ── INNINGS, DECLARATION & FOLLOW-ON LOGIC ──

  declareInnings() {
    const innings = this.getCurrentInnings();
    if (!innings || innings.allOut) return;

    innings.declared = true;
    this.declarationMade = true;
    this.setState(TEST_MATCH_STATES.DECLARATION, `${innings.batTeam} declared innings at ${innings.runs}/${innings.wickets}`);

    this.addCommentary({
      type: 'DECLARATION',
      text: `📢 INNINGS DECLARED! ${innings.batTeam} declare at ${innings.runs}/${innings.wickets} in ${innings.oversFormatted} overs.`,
    });

    this.checkInningsTransition();
  }

  checkInningsTransition() {
    const currentInnings = this.getCurrentInnings();
    if (!currentInnings) return;

    if (currentInnings.allOut || currentInnings.declared) {
      if (this.currentInningsIndex === 0) {
        // Innings 1 Complete -> Start Innings 2
        this.setState(TEST_MATCH_STATES.INNINGS_BREAK, '1st Innings complete');
        this.startInnings(2, currentInnings.bowlTeam, currentInnings.batTeam);
        this.setState(TEST_MATCH_STATES.LIVE, '2nd Innings underway');
      } else if (this.currentInningsIndex === 1) {
        // Innings 2 Complete -> Check Follow-On
        const inn1 = this.inningsList[0];
        const inn2 = this.inningsList[1];
        const lead = inn1.runs - inn2.runs;

        if (lead >= FOLLOW_ON_THRESHOLD) {
          this.followOnEligible = true;
          this.setState(TEST_MATCH_STATES.FOLLOW_ON_CHECK, `Follow-on eligible: ${inn1.batTeam} leads by ${lead} runs`);
          // Default: Auto-enforce follow-on if lead >= 200
          this.enforceFollowOn(true);
        } else {
          // Normal Innings 3
          this.setState(TEST_MATCH_STATES.INNINGS_BREAK, '2nd Innings complete');
          this.startInnings(3, inn1.batTeam, inn1.bowlTeam);
          this.setState(TEST_MATCH_STATES.LIVE, '3rd Innings underway');
        }
      } else if (this.currentInningsIndex === 2) {
        // Innings 3 Complete -> Start Innings 4 Target Chase
        const inn1 = this.inningsList[0];
        const inn2 = this.inningsList[1];
        const inn3 = this.inningsList[2];

        let target = 0;
        if (this.followOnEnforced) {
          target = (inn2.runs + inn3.runs) - inn1.runs + 1;
        } else {
          target = (inn1.runs + inn3.runs) - inn2.runs + 1;
        }

        if (target <= 0) {
          // Batting team won by an innings!
          const marginRuns = Math.abs(target - 1);
          this.setMatchResult(`Won by an Innings and ${marginRuns} Runs`, inn3.bowlTeam);
        } else {
          this.setState(TEST_MATCH_STATES.TARGET_CHASE, `Target set: ${target} runs`);
          const chasingTeam = this.followOnEnforced ? inn1.batTeam : inn2.batTeam;
          const bowlingTeam = chasingTeam === this.teamA.name ? this.teamB.name : this.teamA.name;
          this.startInnings(4, chasingTeam, bowlingTeam);
          this.getCurrentInnings().target = target;
          this.setState(TEST_MATCH_STATES.LIVE, '4th Innings target chase underway');
        }
      } else if (this.currentInningsIndex === 3) {
        // Innings 4 Complete -> Evaluate Match Result
        const inn4 = this.getCurrentInnings();
        const target = inn4.target || 0;

        if (inn4.runs >= target) {
          const wicketsRemaining = 10 - inn4.wickets;
          this.setMatchResult(`Won by ${wicketsRemaining} Wickets`, inn4.batTeam);
        } else if (inn4.runs === target - 1 && (inn4.allOut || this.currentDay >= 5)) {
          this.setMatchResult('Match Tied', 'TIE');
        } else if (inn4.allOut) {
          const marginRuns = target - 1 - inn4.runs;
          this.setMatchResult(`Won by ${marginRuns} Runs`, inn4.bowlTeam);
        } else if (this.currentDay >= 5 && this.sessionOversBowled >= OVERS_PER_SESSION_TARGET) {
          this.setMatchResult('Match Drawn', 'DRAW');
        }
      }
    }

    // Check if target chased in Innings 4 live
    if (this.currentInningsIndex === 3) {
      const inn4 = this.getCurrentInnings();
      if (inn4.target && inn4.runs >= inn4.target) {
        const wicketsRemaining = 10 - inn4.wickets;
        this.setMatchResult(`Won by ${wicketsRemaining} Wickets`, inn4.batTeam);
      }
    }
  }

  enforceFollowOn(enforce = true) {
    this.followOnEnforced = enforce;
    const inn1 = this.inningsList[0];
    const inn2 = this.inningsList[1];

    if (enforce) {
      this.addCommentary({
        type: 'FOLLOW_ON',
        text: `🔁 FOLLOW-ON ENFORCED! ${inn1.batTeam} enforces follow-on. ${inn2.batTeam} to bat again in 3rd Innings.`,
      });
      this.startInnings(3, inn2.batTeam, inn1.batTeam);
    } else {
      this.addCommentary({
        type: 'FOLLOW_ON',
        text: `🚫 FOLLOW-ON DECLINED. ${inn1.batTeam} chooses to bat in 3rd Innings.`,
      });
      this.startInnings(3, inn1.batTeam, inn2.batTeam);
    }
    this.setState(TEST_MATCH_STATES.LIVE, '3rd Innings underway');
  }

  // ── SESSION & DAY MANAGEMENT ──

  checkSessionProgression() {
    if (this.sessionOversBowled >= OVERS_PER_SESSION_TARGET) {
      if (this.currentSession === SESSIONS.MORNING) {
        this.setState(TEST_MATCH_STATES.LUNCH, 'Morning session ended');
        this.addCommentary({ type: 'INTERVAL', text: `🍽️ LUNCH INTERVAL — Day ${this.currentDay}, Morning Session complete.` });
        this.startSession(SESSIONS.AFTERNOON);
        this.setState(TEST_MATCH_STATES.LIVE, 'Afternoon session underway');
      } else if (this.currentSession === SESSIONS.AFTERNOON) {
        this.setState(TEST_MATCH_STATES.TEA, 'Afternoon session ended');
        this.addCommentary({ type: 'INTERVAL', text: `☕ TEA INTERVAL — Day ${this.currentDay}, Afternoon Session complete.` });
        this.startSession(SESSIONS.EVENING);
        this.setState(TEST_MATCH_STATES.LIVE, 'Evening session underway');
      } else if (this.currentSession === SESSIONS.EVENING) {
        this.setState(TEST_MATCH_STATES.STUMPS, `Day ${this.currentDay} Stumps`);
        this.addCommentary({ type: 'INTERVAL', text: `🌇 STUMPS — Day ${this.currentDay} complete.` });

        if (this.currentDay < 5) {
          this.startDay(this.currentDay + 1);
          this.startSession(SESSIONS.MORNING);
          this.setState(TEST_MATCH_STATES.LIVE, `Day ${this.currentDay} Morning session underway`);
        } else {
          // Day 5 End -> Check Draw
          if (!this.matchResult) {
            this.setMatchResult('Match Drawn (Day 5 Stumps)', 'DRAW');
          }
        }
      }
    }
  }

  triggerWeatherInterruption(type = 'Rain Delay') {
    this.weatherStatus = type;
    this.setState(TEST_MATCH_STATES.LIVE, `Weather interruption: ${type}`);
    this.addCommentary({
      type: 'WEATHER',
      text: `🌧️ WEATHER INTERRUPTION: Play suspended due to ${type}.`,
    });
  }

  resumePlay() {
    this.weatherStatus = 'Clear';
    this.setState(TEST_MATCH_STATES.LIVE, 'Play resumed');
    this.addCommentary({
      type: 'WEATHER',
      text: `☀️ PLAY RESUMED: Weather clear, players back on field.`,
    });
  }

  // ── MATCH RESULT & METRICS ──

  setMatchResult(summary, winner) {
    this.matchResult = { summary, winner };
    let finalState = TEST_MATCH_STATES.RESULT;
    if (winner === 'DRAW') finalState = TEST_MATCH_STATES.DRAW;
    if (winner === 'TIE') finalState = TEST_MATCH_STATES.TIE;

    this.setState(finalState, summary);

    // Compute Player of the Match
    this.playerOfTheMatch = this.calculatePlayerOfTheMatch();

    this.addCommentary({
      type: 'RESULT',
      text: `🏆 MATCH COMPLETE: ${winner} - ${summary}. Player of the Match: ${this.playerOfTheMatch?.name || 'TBD'}.`,
    });
  }

  calculatePlayerOfTheMatch() {
    const playerScores = new Map();

    this.inningsList.forEach((inn) => {
      Object.values(inn.batting).forEach((b) => {
        const pts = (b.runs * 1.0) + (b.fours * 1.5) + (b.sixes * 2.5) + (b.runs >= 100 ? 50 : (b.runs >= 50 ? 25 : 0));
        playerScores.set(b.name, (playerScores.get(b.name) || 0) + pts);
      });
      Object.values(inn.bowling).forEach((bw) => {
        const pts = (bw.wickets * 25.0) + (bw.maidens * 8.0) + (bw.wickets >= 5 ? 40 : 0);
        playerScores.set(bw.name, (playerScores.get(bw.name) || 0) + pts);
      });
    });

    let topPlayer = null;
    let maxPts = -1;
    playerScores.forEach((pts, name) => {
      if (pts > maxPts) {
        maxPts = pts;
        topPlayer = { name, impactPoints: pts };
      }
    });

    return topPlayer;
  }

  // ── HELPER CALCULATIONS ──

  getCurrentInnings() {
    return this.inningsList[this.currentInningsIndex] || null;
  }

  formatOvers(balls) {
    const overNum = Math.floor(balls / 6);
    const remainder = balls % 6;
    return `${overNum}.${remainder}`;
  }

  formatDismissalText(type, bowler, fielder) {
    switch (type) {
      case 'bowled': return `b ${bowler}`;
      case 'caught': return `c ${fielder || 'Fielder'} b ${bowler}`;
      case 'lbw': return `lbw b ${bowler}`;
      case 'stumped': return `st ${fielder || 'Keeper'} b ${bowler}`;
      case 'run_out': return `run out (${fielder || 'Fielder'})`;
      default: return 'out';
    }
  }

  logEvent(msg) {
    this.matchLog.push({ timestamp: new Date().toISOString(), message: msg });
  }

  addCommentary(event) {
    this.commentary.unshift({
      id: `comm_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toISOString(),
      ...event,
    });
  }

  // ── REST API JSON PAYLOAD GENERATORS ──

  getLiveSnapshot() {
    const inn = this.getCurrentInnings();
    const inn1 = this.inningsList[0];
    const inn2 = this.inningsList[1];
    const inn3 = this.inningsList[2];
    const inn4 = this.inningsList[3];

    let lead = 0;
    let trail = 0;
    if (this.currentInningsIndex === 1 && inn1 && inn2) {
      const diff = inn1.runs - inn2.runs;
      if (diff >= 0) trail = diff;
      else lead = Math.abs(diff);
    } else if (this.currentInningsIndex === 2 && inn1 && inn2 && inn3) {
      const totalLead = (inn1.runs + inn3.runs) - inn2.runs;
      lead = Math.max(0, totalLead);
    }

    return {
      matchId: this.matchId,
      seriesName: this.seriesName,
      venue: this.venue,
      state: this.state,
      currentDay: this.currentDay,
      currentSession: this.currentSession,
      weatherStatus: this.weatherStatus,
      toss: {
        winner: this.tossWinner,
        decision: this.tossDecision,
      },
      currentInnings: inn ? {
        num: inn.inningsNum,
        batTeam: inn.batTeam,
        bowlTeam: inn.bowlTeam,
        runs: inn.runs,
        wickets: inn.wickets,
        overs: inn.oversFormatted,
        runRate: inn.balls > 0 ? ((inn.runs / (inn.balls / 6))).toFixed(2) : '0.00',
        target: inn.target,
        lead,
        trail,
      } : null,
      currentStriker: inn?.batting[this.currentStriker] || null,
      currentNonStriker: inn?.batting[this.currentNonStriker] || null,
      currentBowler: inn?.bowling[this.currentBowler] || null,
      partnership: this.currentPartnership,
      matchResult: this.matchResult,
      playerOfTheMatch: this.playerOfTheMatch,
      recentCommentary: this.commentary.slice(0, 5),
    };
  }

  getFullScorecard() {
    return {
      matchId: this.matchId,
      seriesName: this.seriesName,
      venue: this.venue,
      teams: [this.teamA, this.teamB],
      matchState: this.state,
      toss: { winner: this.tossWinner, decision: this.tossDecision },
      result: this.matchResult,
      playerOfTheMatch: this.playerOfTheMatch,
      innings: this.inningsList.map((inn) => ({
        inningsNum: inn.inningsNum,
        batTeam: inn.batTeam,
        bowlTeam: inn.bowlTeam,
        totalRuns: inn.runs,
        totalWickets: inn.wickets,
        totalOvers: inn.oversFormatted,
        declared: inn.declared,
        allOut: inn.allOut,
        extras: inn.extras,
        battingCard: Object.values(inn.batting).filter((b) => b.balls > 0 || b.out),
        bowlingCard: Object.values(inn.bowling).filter((bw) => bw.balls > 0),
        fallOfWickets: inn.fallOfWickets,
        partnerships: inn.partnerships,
      })),
    };
  }

  getSessionSummary() {
    return {
      matchId: this.matchId,
      day: this.currentDay,
      session: this.currentSession,
      sessionOversBowled: this.sessionOversBowled,
      dayOversBowled: this.dayOversBowled,
      totalOversBowled: this.totalOversBowled,
      timeline: this.timeline,
    };
  }
}
