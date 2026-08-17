/**
 * Central JWT secret resolution — no insecure defaults in production.
 */
export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET is required in production');
    }
    return 'betking_jwt_secret_dev_key_2026';
  }
  if (process.env.NODE_ENV === 'production') {
    const unsafe = ['betking_jwt_secret_dev_key_2026', 'CHANGE_ME', 'betking_dev_pass'];
    if (unsafe.some((s) => secret.includes(s))) {
      throw new Error('Unsafe JWT_SECRET value detected in production');
    }
  }
  return secret;
}
