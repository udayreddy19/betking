import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Feature-matrix leftovers', () => {
  it('gates casino to DEMO_MODE and fantasy Join off in production', () => {
    const flags = fs.readFileSync(path.resolve(process.cwd(), 'src/utils/featureFlags.js'), 'utf8');
    expect(flags).toContain('CASINO_ENABLED = DEMO_MODE');
    expect(flags).toContain("VITE_FANTASY_JOIN_ENABLED === '1' && !import.meta.env.PROD");

    const fantasy = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/Fantasy/Fantasy.jsx'), 'utf8');
    expect(fantasy).toContain('FANTASY_JOIN_ENABLED');
    expect(fantasy).toContain('licensed contests');

    const play = fs.readFileSync(path.resolve(process.cwd(), 'src/components/GamePlayModal/GamePlayModal.jsx'), 'utf8');
    expect(play).toContain('if (!DEMO_MODE)');
    expect(play).toContain('Casino tables are not live yet');
  });

  it('skips SMS and web-push until email failover SMTP is configured', () => {
    const src = fs.readFileSync(path.resolve(process.cwd(), 'lib/notificationChannels.mjs'), 'utf8');
    expect(src).toContain('SMS_DISABLED_BY_POLICY');
  });

  it('ships gated Playwright staging specs after Sprint 0', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));
    expect(pkg.scripts['test:e2e']).toBe('playwright test');
    expect(pkg.devDependencies['@playwright/test']).toBeTruthy();

    const api = fs.readFileSync(path.resolve(process.cwd(), 'e2e/money-flow.api.spec.js'), 'utf8');
    expect(api).toContain('/api/auth/signup');
    expect(api).toContain('/api/v1/payments/create-order');
    expect(api).toContain('/api/bets/place');
    expect(api).toContain('/api/v1/withdrawals/request');

    const yml = fs.readFileSync(path.resolve(process.cwd(), '.github/workflows/production.yml'), 'utf8');
    expect(yml).toContain('vars.ENABLE_E2E');
  });

  it('signs JWTs with jsonwebtoken rather than a custom HMAC', () => {
    const jwtLib = fs.readFileSync(path.resolve(process.cwd(), 'lib/jwtHs256.mjs'), 'utf8');
    expect(jwtLib).toContain("from 'jsonwebtoken'");
    expect(jwtLib.includes('createHmac')).toBe(false);
  });

  it('mounts first-party live scores/odds and admin KYC/risk routers', () => {
    const index = fs.readFileSync(path.resolve(process.cwd(), 'server/index.js'), 'utf8');
    expect(index).toContain("from './routes/public/liveScores.js'");
    expect(index).toContain("from './routes/public/odds.js'");
    expect(index).toContain("app.use('/api/public/sports'");

    const adminIndex = fs.readFileSync(path.resolve(process.cwd(), 'server/routes/index.js'), 'utf8');
    expect(adminIndex).toContain("from './admin/kyc.js'");
    expect(adminIndex).toContain("from './admin/risk.js'");

    const modal = fs.readFileSync(path.resolve(process.cwd(), 'src/components/MatchDetailModal/MatchDetailModal.jsx'), 'utf8');
    const earlyReturn = modal.indexOf('if (!isOpen || !match) return null');
    expect(earlyReturn).toBeGreaterThan(0);
    const after = modal.slice(earlyReturn);
    expect(after.includes('useState(')).toBe(false);
    expect(after.includes('useEffect(')).toBe(false);

    const profile = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/Profile/Profile.jsx'), 'utf8');
    expect(profile).toContain('await changePassword');
    expect(profile).toContain('await selfExcludeAccount');
    const authRoutes = fs.readFileSync(path.resolve(process.cwd(), 'server/routes/auth.js'), 'utf8');
    expect(authRoutes).toContain('/api/v1/rg/self-exclude');

    const ws = fs.readFileSync(path.resolve(process.cwd(), 'lib/websocketEngine.mjs'), 'utf8');
    expect(ws).toContain("msg.type === 'unsubscribe'");
    const sock = fs.readFileSync(path.resolve(process.cwd(), 'src/services/liveFeedSocket.js'), 'utf8');
    expect(sock).toContain("type: 'unsubscribe'");
    expect(sock.includes('120_000')).toBe(false);
  });
});
