/** Dynamic jersey palette from team data — primary body + contrasting accent panels. */

function hashString(str = '') {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function hexToRgb(hex) {
  const h = (hex || '').replace('#', '');
  if (h.length !== 6) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHex(r, g, b) {
  const to = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn: h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6; break;
      case gn: h = ((bn - rn) / d + 2) / 6; break;
      default: h = ((rn - gn) / d + 4) / 6; break;
    }
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToRgb(h, s, l) {
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

  return {
    r: (r + m) * 255,
    g: (g + m) * 255,
    b: (b + m) * 255,
  };
}

function hslToHex(h, s, l) {
  const { r, g, b } = hslToRgb(h, s, l);
  return rgbToHex(r, g, b);
}

function shadeHex(hex, amount) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return rgbToHex(rgb.r + amount, rgb.g + amount, rgb.b + amount);
}

function isNeutralColor(hex) {
  if (!hex) return true;
  const lower = hex.toLowerCase();
  if (['#fff', '#ffffff', '#e5e7eb', '#f3f4f6', '#d1d5db'].includes(lower)) return true;
  const rgb = hexToRgb(hex);
  if (!rgb) return true;
  const { s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  return s < 12 || l > 82;
}

/** Stable kit color from team name when API sends grey/white. */
export function colorFromTeamName(name = '') {
  const hue = hashString(name) % 360;
  return hslToHex(hue, 58, 42);
}

/** Pick chevron/hem accent that contrasts with the shirt body. */
export function pickJerseyAccent(primaryHex) {
  const rgb = hexToRgb(primaryHex);
  if (!rgb) return '#e4b429';

  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);

  // Yellow/gold shirt → navy accent
  if (h >= 32 && h <= 68 && s > 35) return '#1e3a5f';
  // Very light shirt → rich gold panels
  if (l > 72) return '#d4920a';
  // Dark shirt → bright gold
  if (l < 28) return '#f5cc2e';
  // Red / maroon kit → gold
  if (h >= 330 || h <= 18) return '#e8b923';
  // Green kit → warm gold
  if (h >= 80 && h <= 160) return '#e8b923';
  // Blue / purple / default → gold chevron like reference mockup
  return '#e4b429';
}

export function getJerseyPalette(team) {
  const explicitAccent = team?.accentColor;
  let primary = team?.color;

  if (isNeutralColor(primary)) {
    primary = colorFromTeamName(team?.name || team?.shortName || 'team');
  }

  const accent = explicitAccent || pickJerseyAccent(primary);

  return {
    primary,
    accent,
    light: shadeHex(primary, 42),
    mid: primary,
    shade: shadeHex(primary, -16),
    dark: shadeHex(primary, -44),
    collar: shadeHex(primary, -58),
    accentHi: shadeHex(accent, 28),
    accentLo: shadeHex(accent, -22),
  };
}

/** CSS filter to recolor the approved jersey mockup PNG per team. */
export function getJerseyImageFilter(team) {
  const { primary } = getJerseyPalette(team);
  const rgb = hexToRgb(primary);
  if (!rgb) return 'none';

  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);

  // Reference mockup base: royal blue kit
  const TEMPLATE_HUE = 214;
  const TEMPLATE_SAT = 52;
  const TEMPLATE_LIGHT = 46;

  let hueRotate = h - TEMPLATE_HUE;
  while (hueRotate > 180) hueRotate -= 360;
  while (hueRotate < -180) hueRotate += 360;

  const saturate = clamp(s / TEMPLATE_SAT, 0.7, 1.55);
  const brightness = clamp(l / TEMPLATE_LIGHT, 0.78, 1.22);
  const contrast = clamp(0.96 + (s - TEMPLATE_SAT) / 200, 0.92, 1.08);

  return [
    `hue-rotate(${hueRotate.toFixed(1)}deg)`,
    `saturate(${saturate.toFixed(2)})`,
    `brightness(${brightness.toFixed(2)})`,
    `contrast(${contrast.toFixed(2)})`,
  ].join(' ');
}
