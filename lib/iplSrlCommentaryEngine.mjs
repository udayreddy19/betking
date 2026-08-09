/**
 * Module Y: IPLSRL Commentary Engine
 * Event-driven contextual commentary text generator for simulated delivery outcomes.
 */

export function generateIPLSRLCommentary(delivery) {
  const { over, ball, striker, bowler, runs, outcome, wicketType, isExtra } = delivery;
  const ballText = `${over}.${ball}`;

  if (outcome === 'SIX') {
    const sixPhrases = [
      `smashed high over long-on for a massive SIX! What a hit by ${striker}!`,
      `picked up early, pulled away over deep mid-wicket for a gigantic SIX!`,
      `clears the front leg and lofts it cleanly over long-off for SIX runs!`,
      `dance down the pitch and launches it straight down the ground for a maximum!`,
    ];
    const phrase = sixPhrases[Math.floor(Math.random() * sixPhrases.length)];
    return { over: ballText, text: `${bowler} to ${striker}, SIX! ${phrase}` };
  }

  if (outcome === 'FOUR') {
    const fourPhrases = [
      `driven crisply through covers for FOUR! Superb timing!`,
      `short of a length, pulled sharply through mid-wicket for FOUR!`,
      `guided neatly past short third man, races away for FOUR runs!`,
      `full delivery outside off, creamed through the covers for a boundary!`,
    ];
    const phrase = fourPhrases[Math.floor(Math.random() * fourPhrases.length)];
    return { over: ballText, text: `${bowler} to ${striker}, FOUR! ${phrase}` };
  }

  if (outcome === 'WICKET') {
    const wicketPhrases = {
      bowled: `OUT! BOWLED HIM! ${bowler} breaks through the defense! ${striker} has to walk back!`,
      caught: `OUT! CAUGHT! ${striker} lofts it in the air and taken comfortably in the deep by the fielder!`,
      lbw: `OUT! LBW! Loud appeal and the umpire raises the finger! Plumb in front!`,
      run_out: `OUT! RUN OUT! Direct hit at the striker's end! ${striker} is short of the crease!`,
      stumped: `OUT! STUMPED! ${striker} steps out, misses the turn, and keeper whipped the bails off in a flash!`,
    };
    const phrase = wicketPhrases[wicketType] || `OUT! Wicket falls! ${striker} is dismissed!`;
    return { over: ballText, text: `${bowler} to ${striker}, WICKET! ${phrase}` };
  }

  if (outcome === 'ONE') {
    return { over: ballText, text: `${bowler} to ${striker}, 1 run, pushed down to long-on for a single.` };
  }

  if (outcome === 'TWO') {
    return { over: ballText, text: `${bowler} to ${striker}, 2 runs, worked softly into the gap, quick running gets them two.` };
  }

  if (outcome === 'THREE') {
    return { over: ballText, text: `${bowler} to ${striker}, 3 runs, flicked off the pads past mid-wicket, fine pursuit keeps it to three.` };
  }

  if (outcome === 'WIDE') {
    return { over: ballText, text: `${bowler} to ${striker}, WIDE delivery! Spilled way outside off, extra run added.` };
  }

  if (outcome === 'NO_BALL') {
    return { over: ballText, text: `${bowler} to ${striker}, NO BALL! ${bowler} oversteps the crease! Free hit coming up!` };
  }

  // Default DOT
  return { over: ballText, text: `${bowler} to ${striker}, no run, good length delivery, defended back to the bowler.` };
}
