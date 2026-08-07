/**
 * Enterprise Theme Engine — BetKing Enterprise Platform (lib/themeEngine.mjs)
 * Supports Dark, Light, Custom brand themes, primary accent colors, and custom CSS variables.
 */

const THEMES = new Map([
  ['dark', { name: 'Dark Cyberpunk', bg: '#0b0f19', primary: '#7c3aed', surface: '#1e293b' }],
  ['light', { name: 'Clean 10CRIC Light', bg: '#f8fafc', primary: '#7c3aed', surface: '#ffffff' }],
  ['neon', { name: 'Neon Gold', bg: '#0f172a', primary: '#eab308', surface: '#1e293b' }],
]);

export function getThemeConfig(themeId = 'dark') {
  return THEMES.get(themeId) || THEMES.get('dark');
}
