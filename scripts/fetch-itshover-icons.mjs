#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = 'https://raw.githubusercontent.com/itshover/itshover/master/icons';
const OUT = join(import.meta.dirname, '..', 'src', 'icons', 'itshover');

const ICONS = [
  'home-icon',
  'magnifier-icon',
  'down-chevron',
  'right-chevron',
  'arrow-narrow-up-icon',
  'arrow-narrow-left-icon',
  'arrow-narrow-right-icon',
  'arrow-back-icon',
  'x-icon',
  'file-description-icon',
  'user-icon',
  'trophy-icon',
  'layout-dashboard-icon',
  'wallet-icon',
  'currency-rupee-icon',
  'history-circle-icon',
  'refresh-icon',
  'rosette-discount-icon',
  'shopping-cart-icon',
  'logout-icon',
  'moon-icon',
  'sparkles-icon',
  'unordered-list-icon',
  'chart-bar-icon',
  'users-icon',
  'info-circle-icon',
  'eye-icon',
  'eye-off-icon',
  'external-link-icon',
  'player-icon',
  'gear-icon',
  'filled-checked-icon',
  'simple-checked-icon',
  'qrcode-icon',
  'lock-icon',
  'shield-check',
  'credit-card',
  'layout-sidebar-right-icon',
  'filled-bell-icon',
  'trash-icon',
];

function tsxToJsx(content, fileName) {
  let jsx = content
    .replace(/^import type .*;\n?/gm, '')
    .replace(/import type \{[^}]+\} from ['"][^'"]+['"];\n?/g, '')
    .replace(/export interface [\s\S]*?\}\n\n?/g, '')
    .replace(/forwardRef<[^>]+>/g, 'forwardRef')
    .replace(/useCallback<[^>]+>/g, 'useCallback')
    .replace(/useImperativeHandle<[^>]+>/g, 'useImperativeHandle')
    .replace(/: AnimatedIconHandle/g, '')
    .replace(/: AnimatedIconProps/g, '')
    .replace(/from ['"]\.\/types['"]/g, "from './types.js'")
    .replace(/export default (\w+);/, 'export { $1 };');

  return jsx;
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed ${url}: ${res.status}`);
  return res.text();
}

async function main() {
  await mkdir(OUT, { recursive: true });

  const types = await fetchText(`${BASE}/types.ts`);
  const typesJs = types
    .replace(/^import type .*;\n?/gm, '')
    .replace(/export type IconEasing[\s\S]*?;/m, '')
    .replace(/export interface AnimatedIconProps extends Omit<[\s\S]*?\{/, 'export const AnimatedIconProps = {')
    .replace(/export interface AnimatedIconHandle \{[\s\S]*?\}/m, '/** @typedef {{ startAnimation: () => void, stopAnimation: () => void }} AnimatedIconHandle */');

  // Simpler types.js - hand-written is cleaner
  const typesJsContent = `/** @typedef {import('react').SVGProps<SVGSVGElement>} SVGProps */

export const DEFAULT_STROKE_WIDTH = 2;

export function scaledStrokeWidth(strokeWidth, viewBoxSize) {
  return strokeWidth * (viewBoxSize / 24);
}

/** @typedef {{ startAnimation: () => void, stopAnimation: () => void }} AnimatedIconHandle */

/** @typedef {Omit<SVGProps, 'ref' | 'onAnimationStart' | 'onAnimationEnd' | 'onAnimationIteration' | 'onDrag' | 'onDragEnd' | 'onDragEnter' | 'onDragExit' | 'onDragLeave' | 'onDragOver' | 'onDragStart' | 'onDrop' | 'values'> & { size?: number | string, color?: string, strokeWidth?: number, className?: string }} AnimatedIconProps */
`;

  await writeFile(join(OUT, 'types.js'), typesJsContent);

  const exports = [];

  for (const icon of ICONS) {
    const fileName = `${icon}.tsx`;
    const raw = await fetchText(`${BASE}/${fileName}`);
    const jsx = tsxToJsx(raw, fileName);
    const outName = icon.replace(/-([a-z])/g, (_, c) => c.toUpperCase()).replace(/-/g, '');
    const outFile = `${icon}.jsx`;
    await writeFile(join(OUT, outFile), jsx);
    const exportName = jsx.match(/const (\w+) = forwardRef/)?.[1] ?? outName;
    exports.push({ file: outFile.replace('.jsx', ''), exportName });
    console.log(`✓ ${outFile}`);
  }

  const indexContent = `${exports
    .map(({ file, exportName }) => `export { ${exportName} } from './${file}.jsx';`)
    .join('\n')}
`;

  await writeFile(join(OUT, 'index.js'), indexContent);
  console.log(`\nWrote ${exports.length} icons to ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
