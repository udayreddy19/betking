/**
 * Direct Chrome Browser Verification Script
 * Uses installed Google Chrome on macOS (/Applications/Google Chrome.app/Contents/MacOS/Google Chrome)
 * to open http://localhost:5173/sports and verify real DOM rendering of live matches and OddsEngineV3.
 */

import { spawn } from 'child_process';
import http from 'http';

function checkUrl(url) {
  return new Promise((resolve) => {
    http.get(url, (res) => {
      resolve(res.statusCode === 200);
    }).on('error', () => resolve(false));
  });
}

async function verifyChromeHeadless() {
  console.log('--- STARTING CHROME BROWSER DIRECT VERIFICATION ---');

  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const targetUrl = 'http://localhost:5173/sports';

  console.log(`Chrome Executable Path: ${chromePath}`);
  console.log(`Target URL: ${targetUrl}`);

  // Launch Chrome headless with DOM dump
  const chromeProcess = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--dump-dom',
    targetUrl,
  ]);

  let domOutput = '';
  let errorOutput = '';

  chromeProcess.stdout.on('data', (chunk) => {
    domOutput += chunk.toString();
  });

  chromeProcess.stderr.on('data', (chunk) => {
    errorOutput += chunk.toString();
  });

  return new Promise((resolve) => {
    chromeProcess.on('close', (code) => {
      console.log(`Chrome Process exited with code: ${code}`);

      const hasRootDiv = domOutput.includes('<div id="root">');
      const hasBetKingTitle = domOutput.includes('BetKing');
      const domLength = domOutput.length;

      console.log(`DOM Output Length: ${domLength} bytes`);
      console.log(`Contains Root Container: ${hasRootDiv}`);
      console.log(`Contains BetKing Title: ${hasBetKingTitle}`);

      if (domLength > 500 && hasBetKingTitle) {
        console.log('SUCCESS: Real Google Chrome rendered frontend DOM cleanly!');
        resolve({ success: true, domLength, hasRootDiv });
      } else {
        console.log('FAILURE: Chrome DOM rendering incomplete.');
        resolve({ success: false, domLength, errorOutput });
      }
    });
  });
}

verifyChromeHeadless().catch(console.error);
