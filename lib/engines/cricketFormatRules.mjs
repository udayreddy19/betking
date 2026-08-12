/**
 * Format-Specific Cricket Rules Engine (lib/engines/cricketFormatRules.mjs)
 * Defines overs, max balls, powerplay thresholds, target calculation, and innings completion rules per format.
 * Supports T20, T20I, T10, ODI, TEST, and THE_HUNDRED.
 */

export class CricketFormatRules {
  static getFormatRules(formatStr = 'T20', competitionStr = '') {
    const fmt = String(formatStr || '').toUpperCase();
    const comp = String(competitionStr || '').toUpperCase();

    if (fmt.includes('HUNDRED') || comp.includes('HUNDRED')) {
      return {
        format: 'THE_HUNDRED',
        maxOvers: 20, // 20 five-ball overs
        maxBalls: 100,
        powerplayOvers: 5, // 25 balls
        powerplayBalls: 25,
        ballsPerOver: 5,
        hasTieBreak: true,
        superOver: true,
      };
    }

    if (fmt.includes('T10') || comp.includes('T10')) {
      return {
        format: 'T10',
        maxOvers: 10,
        maxBalls: 60,
        powerplayOvers: 3,
        powerplayBalls: 18,
        ballsPerOver: 6,
        hasTieBreak: true,
        superOver: true,
      };
    }

    if (fmt.includes('ODI') || fmt.includes('50') || fmt.includes('LIST_A') || comp.includes('WORLD CUP') || comp.includes('ODI')) {
      return {
        format: 'ODI',
        maxOvers: 50,
        maxBalls: 300,
        powerplayOvers: 10,
        powerplayBalls: 60,
        ballsPerOver: 6,
        hasTieBreak: true,
        superOver: false,
      };
    }

    if (fmt.includes('TEST') || comp.includes('TEST') || comp.includes('COUNTY')) {
      return {
        format: 'TEST',
        maxOvers: null, // Unlimited
        maxBalls: null,
        powerplayOvers: null,
        powerplayBalls: null,
        ballsPerOver: 6,
        hasTieBreak: false,
        superOver: false,
      };
    }

    // Default T20 / T20I / Domestic T20 / IPL
    return {
      format: 'T20',
      maxOvers: 20,
      maxBalls: 120,
      powerplayOvers: 6,
      powerplayBalls: 36,
      ballsPerOver: 6,
      hasTieBreak: true,
      superOver: true,
    };
  }
}
