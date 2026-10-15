import { afterEach, describe, expect, it } from 'vitest';
import rejectDemoModeProductionPlugin from '../../vite-plugins/rejectDemoModeProduction.js';

const ORIGINAL = process.env.VITE_DEMO_MODE;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.VITE_DEMO_MODE;
  else process.env.VITE_DEMO_MODE = ORIGINAL;
});

describe('DEMO_MODE must be false in production', () => {
  it('fails a production build when VITE_DEMO_MODE=1', () => {
    process.env.VITE_DEMO_MODE = '1';
    expect(() => rejectDemoModeProductionPlugin().configResolved({ mode: 'production' }))
      .toThrow(/VITE_DEMO_MODE/);
  });

  it('allows a production build when demo mode is off', () => {
    delete process.env.VITE_DEMO_MODE;
    expect(() => rejectDemoModeProductionPlugin().configResolved({ mode: 'production' })).not.toThrow();
  });

  it('does not block non-production modes', () => {
    process.env.VITE_DEMO_MODE = '1';
    expect(() => rejectDemoModeProductionPlugin().configResolved({ mode: 'development' })).not.toThrow();
  });
});
