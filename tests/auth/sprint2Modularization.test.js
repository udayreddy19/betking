import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Sprint 2 modularization', () => {
  it('server/index.js mounts extracted routers and stays a thin bootstrap', () => {
    const index = fs.readFileSync(path.resolve(process.cwd(), 'server/index.js'), 'utf8');
    expect(index).toContain("from './routes/auth.js'");
    expect(index).toContain("from './routes/bets.js'");
    expect(index).toContain("from './routes/wallet.js'");
    expect(index).toContain("from './routes/live.js'");
    expect(index).toContain("from './routes/support.js'");
    expect(index).toContain("from './routes/growth.js'");
    expect(index.split('\n').length).toBeLessThan(200);
    expect(index.includes("app.post('/api/bet/cashout'")).toBe(false);
  });

  it('AuthContext facade re-exports domain hooks', () => {
    const facade = fs.readFileSync(path.resolve(process.cwd(), 'src/context/AuthContext.jsx'), 'utf8');
    expect(facade).toContain('useSession');
    expect(facade).toContain('useWallet');
    expect(facade).toContain('useLoyalty');
    expect(facade).toContain('useResponsibleGaming');
    expect(facade).toContain('AuthProvider');
    expect(fs.existsSync(path.resolve(process.cwd(), 'src/context/auth/AuthProvider.jsx'))).toBe(true);
  });
});
