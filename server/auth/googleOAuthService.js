/**
 * Google OAuth — authorization URL, token exchange, and profile fetch.
 */

export function getGoogleOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  const frontendUrl = (process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${frontendUrl}/_oauth/google`;

  return {
    clientId,
    clientSecret,
    redirectUri,
    enabled: Boolean(clientId && clientSecret),
  };
}

export function buildGoogleAuthUrl(state) {
  const { clientId, redirectUri } = getGoogleOAuthConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

const inFlightCodeExchanges = new Map();

async function exchangeGoogleCodeOnce(code) {
  if (inFlightCodeExchanges.has(code)) {
    return inFlightCodeExchanges.get(code);
  }

  const work = (async () => {
    const { clientId, clientSecret, redirectUri } = getGoogleOAuthConfig();

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokenData.access_token) {
      const rawMessage = tokenData.error_description || tokenData.error || 'Google token exchange failed.';
      const message = tokenData.error === 'invalid_grant'
        ? 'Google sign-in expired or was already used. Please try again.'
        : rawMessage;
      return { error: message, code: 'GOOGLE_TOKEN_EXCHANGE_FAILED', status: 502 };
    }

    const profileRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const profile = await profileRes.json().catch(() => ({}));
    if (!profileRes.ok || !profile.sub) {
      return { error: 'Could not load Google profile.', code: 'GOOGLE_PROFILE_FAILED', status: 502 };
    }

    if (!profile.email) {
      return { error: 'Google account must have a verified email address.', code: 'GOOGLE_EMAIL_REQUIRED', status: 400 };
    }

    return {
      googleSub: profile.sub,
      email: String(profile.email).trim().toLowerCase(),
      emailVerified: profile.email_verified === true,
      firstName: String(profile.given_name || '').trim(),
      lastName: String(profile.family_name || '').trim(),
      displayName: String(profile.name || '').trim(),
      avatarUrl: profile.picture || null,
    };
  })();

  inFlightCodeExchanges.set(code, work);
  try {
    return await work;
  } finally {
    setTimeout(() => inFlightCodeExchanges.delete(code), 60_000);
  }
}

export async function exchangeGoogleCode(code) {
  return exchangeGoogleCodeOnce(code);
}
