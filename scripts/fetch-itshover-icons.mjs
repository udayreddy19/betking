#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = 'https://raw.githubusercontent.com/itshover/itshover/master/icons';
const OUT = join(import.meta.dirname, '..', 'src', 'icons', 'itshover');

/** Sport, league, and specialty UI icons — UI chrome stays on @animateicons/react */
const ICONS = [
  'trophy-icon',
  'globe-icon',
  'world-icon',
  'target-icon',
  'gamepad-icon',
  'flame-icon',
  'rocket-icon',
  'gauge-icon',
  'stack-3-icon',
  'users-group-icon',
  'filled-bell-icon',
  'chart-bar-icon',
  'users-icon',
];

function tsxToJsx(content) {
  return content
    .replace(/^import type .*;\n?/gm, '')
    .replace(/import type \{[^}]+\} from ['"][^'"]+['"];\n?/g, '')
    .replace(/export interface [\s\S]*?\}\n\n?/g, '')
    .replace(/useRef<[^>]+>/g, 'useRef')
    .replace(/forwardRef<[^>]+>/g, 'forwardRef')
    .replace(/useCallback<[^>]+>/g, 'useCallback')
    .replace(/useImperativeHandle<[^>]+>/g, 'useImperativeHandle')
    .replace(/: AnimatedIconHandle/g, '')
    .replace(/: AnimatedIconProps/g, '')
    .replace(/from ['"]\.\/types['"]/g, "from './types.js'")
    .replace(/export default (\w+);/, 'export { $1 };');
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed ${url}: ${res.status}`);
  return res.text();
}

async function main() {
  await mkdir(OUT, { recursive: true });

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
    const jsx = tsxToJsx(raw);
    const outFile = `${icon}.jsx`;
    await writeFile(join(OUT, outFile), jsx);
    const exportName = jsx.match(/const (\w+) = forwardRef/)?.[1] ?? icon;
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
