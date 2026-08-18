/**
 * Create or update an admin-eligible user from env vars.
 * Usage: ADMIN_BOOTSTRAP_EMAIL=a@b.com ADMIN_BOOTSTRAP_PASSWORD='...' node scripts/ensureAdminUser.mjs
 */
import { hashPassword } from '../server/auth/passwordHasher.js';
import { query, pool } from '../db/pg.js';

const email = String(process.env.ADMIN_BOOTSTRAP_EMAIL || '').trim().toLowerCase();
const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
const firstName = String(process.env.ADMIN_BOOTSTRAP_FIRST_NAME || 'Admin').trim();
const lastName = String(process.env.ADMIN_BOOTSTRAP_LAST_NAME || 'Operator').trim();

if (!email || !email.includes('@') || !password) {
  console.error('Set ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD');
  process.exit(1);
}

const passwordHash = await hashPassword(password);
const existing = await query('SELECT user_id FROM users WHERE email = $1', [email]);

let userId;
if (existing.rows[0]?.user_id) {
  userId = existing.rows[0].user_id;
  await query(
    `UPDATE users
     SET password_hash = $2, role = 'ADMIN', status = 'ACTIVE',
         failed_login_attempts = 0, locked_until = NULL,
         email_verified_at = COALESCE(email_verified_at, NOW()),
         updated_at = NOW()
     WHERE user_id = $1`,
    [userId, passwordHash],
  );
} else {
  userId = `usr_admin_${Date.now().toString(36)}`;
  await query(
    `INSERT INTO users (
       user_id, email, password_hash, first_name, last_name,
       country, currency, role, status, email_verified_at
     ) VALUES ($1, $2, $3, $4, $5, 'India', 'INR', 'ADMIN', 'ACTIVE', NOW())`,
    [userId, email, passwordHash, firstName, lastName],
  );
}

await query(
  `INSERT INTO user_profiles (user_id, display_name, account_status)
   VALUES ($1, $2, 'ACTIVE')
   ON CONFLICT (user_id) DO UPDATE SET account_status = 'ACTIVE'`,
  [userId, `${firstName} ${lastName}`.trim()],
);
await query(
  `INSERT INTO wallets (wallet_id, user_id, balance, bonus_balance, currency)
   VALUES ($1, $2, 0.00, 0.00, 'INR')
   ON CONFLICT (user_id) DO NOTHING`,
  [`wal_${userId}`, userId],
);

console.log(`Admin user ready: ${email} (${userId})`);
await pool.end();
