import { query, withTransaction } from '../db.js';
import { isRazorpayConfigured, getRazorpay } from './razorpay.js';
import { isPayuConfigured, pingPayu, isPayuPayoutConfigured, pingPayuPayouts } from './payu.js';
import { isPinelabsConfigured, pingPinelabs } from './pinelabs.js';

const PROVIDERS = ['RAZORPAY', 'PAYU', 'PINELABS'];

async function mapRow(r) {
  const provider = r.provider;
  const payout = await payoutCapabilities(provider);
  const depositsEnabled = r.deposits_enabled == null ? true : Boolean(r.deposits_enabled);
  const payoutsEnabled = r.payouts_enabled == null ? true : Boolean(r.payouts_enabled);
  return {
    id: r.id,
    provider,
    enabled: Boolean(r.enabled),
    depositsEnabled,
    payoutsEnabled,
    isPrimary: Boolean(r.is_primary),
    environment: r.environment,
    allowUserSelection: Boolean(r.allow_user_selection),
    productContext: String(r.product_context || 'SWITCHP').toUpperCase(),
    businessModeEligible: r.business_mode_eligible == null ? true : Boolean(r.business_mode_eligible),
    healthStatus: r.health_status,
    lastHealthCheck: r.last_health_check,
    lastLatencyMs: Number(r.last_latency_ms || 0),
    configured: providerConfigured(provider),
    payoutConfigured: payout.configured && payoutsEnabled,
    payoutNote: !payoutsEnabled
      ? 'Payouts disabled in Admin → Gateways'
      : payout.note,
    updatedAt: r.updated_at,
  };
}

async function payoutCapabilities(provider) {
  const p = String(provider || '').toUpperCase();
  if (p === 'RAZORPAY') {
    const { getRazorpayxAccountNumber } = await import('./siteSettings.js');
    const acct = await getRazorpayxAccountNumber();
    const ok = Boolean(acct);
    return {
      configured: ok,
      note: ok
        ? 'RazorpayX IMPS payouts ready'
        : 'Set RazorpayX account (env or Admin → Gateways)',
    };
  }
  if (p === 'PAYU') {
    const ok = isPayuPayoutConfigured();
    return {
      configured: ok,
      note: ok ? 'PayU Payouts credentials present' : 'Set PAYU_CLIENT_ID / PAYU_CLIENT_SECRET for payouts',
    };
  }
  if (p === 'PINELABS') {
    const ok = isPinelabsConfigured();
    return {
      configured: ok,
      note: ok ? 'Pine Labs Plural payouts use same API credentials' : 'Configure PINELABS_* for payouts',
    };
  }
  return { configured: false, note: '' };
}

export function providerConfigured(provider) {
  const p = String(provider || '').toUpperCase();
  if (p === 'RAZORPAY') return isRazorpayConfigured();
  if (p === 'PAYU') return isPayuConfigured();
  if (p === 'PINELABS') return isPinelabsConfigured();
  return false;
}

export async function listGateways() {
  const { rows } = await query(
    `SELECT * FROM payment_gateway_configs ORDER BY provider ASC`,
  );
  return Promise.all(rows.map(mapRow));
}

export async function getGateway(provider) {
  const p = String(provider || '').toUpperCase();
  const { rows } = await query(
    `SELECT * FROM payment_gateway_configs WHERE provider = $1`,
    [p],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function isGatewayEnabled(provider) {
  const gw = await getGateway(provider);
  return Boolean(gw?.enabled);
}

export async function isGatewayDepositsEnabled(provider) {
  const gw = await getGateway(provider);
  return Boolean(gw?.enabled && gw?.depositsEnabled !== false);
}

export async function isGatewayPayoutsEnabled(provider) {
  const gw = await getGateway(provider);
  return Boolean(gw?.enabled && gw?.payoutsEnabled !== false && gw?.payoutConfigured);
}

export async function getPrimaryGateway() {
  const { rows } = await query(
    `SELECT * FROM payment_gateway_configs
     WHERE is_primary = TRUE AND enabled = TRUE
     LIMIT 1`,
  );
  if (rows[0]) return mapRow(rows[0]);
  const { rows: any } = await query(
    `SELECT * FROM payment_gateway_configs WHERE enabled = TRUE ORDER BY provider LIMIT 1`,
  );
  return any[0] ? mapRow(any[0]) : null;
}

/**
 * Resolve which provider to use for a new SwitchP wallet deposit checkout.
 * Never uses VEXQORA-tagged merchant gateways for wallet deposits.
 * Honors user selection only when allow_user_selection is on and both are enabled.
 */
export async function resolveCheckoutProvider(preferred) {
  const all = await listGateways();
  const allowSelect = all.some((g) => g.allowUserSelection);
  // Wallet rails: SWITCHP (or untagged legacy) only — never VEXQORA merchant credentials
  const enabled = all.filter(
    (g) => g.enabled && String(g.productContext || 'SWITCHP').toUpperCase() !== 'VEXQORA',
  );
  if (!enabled.length) {
    const err = new Error(
      'No SWITCHP wallet gateway is enabled. VEXQORA-tagged gateways cannot settle wallet deposits.',
    );
    err.status = 503;
    err.code = 'GATEWAYS_DISABLED';
    throw err;
  }

  const pref = String(preferred || '').toUpperCase();
  if (allowSelect && pref && PROVIDERS.includes(pref)) {
    const hit = enabled.find((g) => g.provider === pref);
    if (hit) return hit;
    const blocked = all.find((g) => g.provider === pref && g.productContext === 'VEXQORA');
    if (blocked) {
      const err = new Error('This gateway is bound to VEXQORA and cannot process SwitchP deposits');
      err.status = 403;
      err.code = 'PRODUCT_GATEWAY_MISMATCH';
      throw err;
    }
  }

  const primary = enabled.find((g) => g.isPrimary) || enabled[0];
  return primary;
}

export async function updateGateway(provider, patch = {}) {
  const p = String(provider || '').toUpperCase();
  if (!PROVIDERS.includes(p)) {
    const err = new Error('Unknown payment provider');
    err.status = 400;
    throw err;
  }

  return withTransaction(async (client) => {
    const cur = await client.query(
      `SELECT * FROM payment_gateway_configs WHERE provider = $1 FOR UPDATE`,
      [p],
    );
    if (!cur.rows[0]) {
      const err = new Error('Gateway config not found');
      err.status = 404;
      throw err;
    }

    let enabled = cur.rows[0].enabled;
    let isPrimary = cur.rows[0].is_primary;
    let allowUserSelection = cur.rows[0].allow_user_selection;
    let environment = cur.rows[0].environment;
    let depositsEnabled = cur.rows[0].deposits_enabled == null ? true : cur.rows[0].deposits_enabled;
    let payoutsEnabled = cur.rows[0].payouts_enabled == null ? true : cur.rows[0].payouts_enabled;
    let productContext = String(cur.rows[0].product_context || 'SWITCHP').toUpperCase();

    if (typeof patch.enabled === 'boolean') enabled = patch.enabled;
    if (typeof patch.allowUserSelection === 'boolean') allowUserSelection = patch.allowUserSelection;
    if (typeof patch.depositsEnabled === 'boolean') depositsEnabled = patch.depositsEnabled;
    if (typeof patch.payoutsEnabled === 'boolean') payoutsEnabled = patch.payoutsEnabled;
    if (patch.environment) environment = String(patch.environment).slice(0, 32);
    if (patch.productContext) {
      const nextPc = String(patch.productContext).toUpperCase();
      if (!['VEXQORA', 'ODDSYRA', 'SWITCHP'].includes(nextPc)) {
        const err = new Error('productContext must be VEXQORA, ODDSYRA, or SWITCHP');
        err.status = 400;
        throw err;
      }
      // A gateway tagged VEXQORA cannot also be primary for SWITCHP wallet rails
      if (nextPc === 'VEXQORA' && isPrimary && patch.isPrimary !== false) {
        isPrimary = false;
      }
      productContext = nextPc;
    }

    if (patch.isPrimary === true) {
      if (productContext === 'VEXQORA') {
        const err = new Error(
          'A VEXQORA-tagged gateway cannot be the primary SwitchP wallet gateway',
        );
        err.status = 400;
        err.code = 'PRODUCT_GATEWAY_MISMATCH';
        throw err;
      }
      isPrimary = true;
      enabled = true;
      await client.query(
        `UPDATE payment_gateway_configs SET is_primary = FALSE, updated_at = NOW()
         WHERE provider <> $1 AND is_primary = TRUE`,
        [p],
      );
    } else if (patch.isPrimary === false) {
      isPrimary = false;
    }

    if (!enabled && isPrimary) {
      isPrimary = false;
    }

    const { rows } = await client.query(
      `UPDATE payment_gateway_configs
       SET enabled = $2,
           is_primary = $3,
           allow_user_selection = $4,
           environment = $5,
           deposits_enabled = $6,
           payouts_enabled = $7,
           product_context = $8,
           updated_at = NOW()
       WHERE provider = $1
       RETURNING *`,
      [p, enabled, isPrimary, allowUserSelection, environment, depositsEnabled, payoutsEnabled, productContext],
    );

    // If nothing is primary, promote first enabled gateway
    const primaryCheck = await client.query(
      `SELECT 1 FROM payment_gateway_configs WHERE is_primary = TRUE LIMIT 1`,
    );
    if (!primaryCheck.rows[0]) {
      await client.query(
        `UPDATE payment_gateway_configs
         SET is_primary = TRUE, updated_at = NOW()
         WHERE id = (
           SELECT id FROM payment_gateway_configs WHERE enabled = TRUE ORDER BY provider LIMIT 1
         )`,
      );
    }

    // Sync allow_user_selection across both (global flag, old OddsYra behavior)
    if (typeof patch.allowUserSelection === 'boolean') {
      await client.query(
        `UPDATE payment_gateway_configs SET allow_user_selection = $1, updated_at = NOW()`,
        [allowUserSelection],
      );
    }

    return mapRow(rows[0]);
  });
}

export async function testGatewayConnection(provider) {
  const p = String(provider || '').toUpperCase();
  const started = Date.now();

  try {
    if (p === 'RAZORPAY') {
      if (!isRazorpayConfigured()) {
        throw new Error('RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not configured');
      }
      const rzp = getRazorpay();
      await rzp.orders.all({ count: 1 });
    } else if (p === 'PAYU') {
      if (!isPayuConfigured()) {
        throw new Error('PAYU_MERCHANT_KEY / PAYU_MERCHANT_SALT not configured');
      }
      await pingPayu();
      // Payouts use a separate OAuth product; surface status but do not fail PG key/salt health.
      if (isPayuPayoutConfigured()) {
        try {
          await pingPayuPayouts();
        } catch (e) {
          console.warn('[paymentGateways] PayU PG OK; payouts not ready:', e.message);
        }
      }
    } else if (p === 'PINELABS') {
      if (!isPinelabsConfigured()) {
        throw new Error('PINELABS_CLIENT_ID / PINELABS_CLIENT_SECRET not configured');
      }
      await pingPinelabs();
    } else {
      throw new Error('Unknown provider');
    }

    const latencyMs = Date.now() - started;
    await query(
      `UPDATE payment_gateway_configs
       SET health_status = 'HEALTHY', last_health_check = NOW(), last_latency_ms = $2, updated_at = NOW()
       WHERE provider = $1`,
      [p, latencyMs],
    );
    return { provider: p, healthy: true, latencyMs, message: 'Connection OK' };
  } catch (err) {
    const latencyMs = Date.now() - started;
    await query(
      `UPDATE payment_gateway_configs
       SET health_status = 'UNHEALTHY', last_health_check = NOW(), last_latency_ms = $2, updated_at = NOW()
       WHERE provider = $1`,
      [p, latencyMs],
    );
    return {
      provider: p,
      healthy: false,
      latencyMs,
      message: err.message || 'Connection failed',
    };
  }
}
