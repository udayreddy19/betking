import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');

describe('Google OAuth integration', () => {
  it('adds migration for google_sub on users', () => {
    const sql = fs.readFileSync(path.join(root, 'migrations/045_google_oauth.sql'), 'utf8');
    expect(sql).toContain('google_sub');
    expect(sql).toContain('avatar_url');
  });

  it('exposes Google auth routes and provider status', () => {
    const routes = fs.readFileSync(path.join(root, 'server/auth/authRoutes.js'), 'utf8');
    expect(routes).toContain('/google/start');
    expect(routes).toContain('/google/callback');
    expect(routes).toContain('/providers');
    expect(routes).toContain('loginWithGoogle');
  });

  it('registers frontend OAuth callback route', () => {
    const app = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
    expect(app).toContain('/_oauth/google');
    expect(fs.existsSync(path.join(root, 'src/pages/Auth/OAuthGoogleCallback.jsx'))).toBe(true);
  });

  it('shows Continue with Google on login and register', () => {
    const login = fs.readFileSync(path.join(root, 'src/components/LoginModal/LoginModal.jsx'), 'utf8');
    const register = fs.readFileSync(path.join(root, 'src/pages/Register/Register.jsx'), 'utf8');
    expect(login).toContain('SocialAuthButtons');
    expect(register).toContain('SocialAuthButtons');
  });
});
