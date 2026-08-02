/** Shared jersey color helpers for API + UI. */

function hashString(str = '') {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function hslToHex(h, s, l) {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  const to = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function colorFromTeamName(name = '') {
  const hue = hashString(name) % 360;
  return hslToHex(hue, 58, 42);
}

export function teamKitColors(team1Name, team2Name) {
  const c1 = colorFromTeamName(team1Name);
  let c2 = colorFromTeamName(team2Name);
  if (c1 === c2) {
    c2 = hslToHex((hashString(team2Name) + 137) % 360, 58, 42);
  }
  return { team1Color: c1, team2Color: c2 };
}
