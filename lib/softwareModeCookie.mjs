/**
 * Software Platform public-mode cookie (`sp_public`).
 *
 * nginx maps `$cookie_sp_public` to pick which static root serves the public
 * site (native OddsYra sportsbook vs. standalone software-platform SPA).
 * The cookie is intentionally NOT httpOnly: the boot script in index.html
 * also reads it. It carries no secret — it is only a routing hint.
 */

export const SOFTWARE_MODE_COOKIE = 'sp_public';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function cookieSecure() {
  return process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production';
}

/** Same attributes on set + clear — otherwise browsers keep a Secure cookie. */
function cookieBase() {
  return {
    path: '/',
    secure: cookieSecure(),
    sameSite: 'lax',
  };
}

export function setSoftwareModeCookie(res, enabled) {
  const base = cookieBase();
  if (enabled) {
    res.cookie(SOFTWARE_MODE_COOKIE, '1', {
      ...base,
      httpOnly: false,
      maxAge: MAX_AGE_MS,
    });
  } else {
    res.clearCookie(SOFTWARE_MODE_COOKIE, {
      ...base,
      httpOnly: false,
    });
  }
}
