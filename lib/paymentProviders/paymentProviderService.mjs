import { query, withTransaction } from '../../db/pg.js';
import { addColumnIfMissing, memoizeEnsure } from '../schemaGuard.mjs';
import { razorpayProvider } from './RazorpayProvider.mjs';
import { cashfreeProvider } from './CashfreeProvider.mjs';
import { hdfcProvider } from './HdfcProvider.mjs';
import { upiProvider } from './UpiProvider.mjs';
import { isValidCollectVpa, normalizeCollectVpa, normalizePayeeName, parseGatewaySettings } from './upiCollect.mjs';
import { logger } from '../logger.mjs';

const RETIRED_PROVIDERS = new Set(['PAYU', 'PINELABS']);
const ADMIN_VISIBLE_PROVIDERS = new Set(['RAZORPAY', 'HDFC', 'UPI']);

const ensureGatewaySchema = memoizeEnsure(async () => {
  await addColumnIfMissing(
    'payment_gateway_configs',
    'settings',
    `ALTER TABLE payment_gateway_configs ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb`,
  );
  await query(`ALTER TABLE payment_gateway_configs DROP CONSTRAINT IF EXISTS payment_gateway_configs_provider_check`);
  await query(
    `INSERT INTO payment_gateway_configs (
       id, provider, enabled, is_primary, environment, allow_user_selection, health_status, settings
     )
     VALUES
       ('gw_hdfc', 'HDFC', false, false, 'uat', false, 'UNKNOWN', '{}'::jsonb),
       ('gw_upi', 'UPI', false, false, 'production', false, 'UNKNOWN', '{}'::jsonb)
     ON CONFLICT (provider) DO NOTHING`,
  );
  await query(
    `UPDATE payment_gateway_configs
        SET enabled = false, is_primary = false, updated_at = NOW()
      WHERE provider IN ('PAYU', 'PINELABS') AND (enabled = true OR is_primary = true)`,
  );
  await query(
    `UPDATE payment_gateway_configs
        SET is_primary = true, updated_at = NOW()
      WHERE provider = (
        SELECT provider FROM payment_gateway_configs
         WHERE enabled = true
           AND provider NOT IN ('PAYU', 'PINELABS')
         ORDER BY CASE provider WHEN 'HDFC' THEN 0 WHEN 'RAZORPAY' THEN 1 WHEN 'UPI' THEN 2 ELSE 3 END
         LIMIT 1
      )
      AND NOT EXISTS (SELECT 1 FROM payment_gateway_configs WHERE is_primary = true)`,
  );
});

class PaymentProviderService {
  constructor() {
    this.providers = new Map();
    this.registerProvider(razorpayProvider);
    this.registerProvider(cashfreeProvider);
    this.registerProvider(hdfcProvider);
    this.registerProvider(upiProvider);
  }

  registerProvider(providerInstance) {
    this.providers.set(providerInstance.name.toUpperCase(), providerInstance);
  }

  getAvailableProviders() {
    const list = [];
    for (const [, provider] of this.providers.entries()) {
      list.push(provider.getPublicConfig());
    }
    return list;
  }

  getDefaultProvider() {
    return 'CASHFREE';
  }

  getProvider(providerName = 'CASHFREE') {
    const key = String(providerName || '').toUpperCase();
    const provider = this.providers.get(key);
    if (!provider) {
      throw new Error(`UNKNOWN_PAYMENT_PROVIDER: Payment provider '${providerName}' is not registered`);
    }
    return provider;
  }

  /**
   * Fetch all gateway configs from DB merged with live provider readiness and transaction stats.
   */
  async getGatewayConfigs() {
    try {
      await ensureGatewaySchema();
      const res = await query(
        `SELECT id, provider, enabled, is_primary, environment, allow_user_selection,
                health_status, last_health_check, last_latency_ms, settings, created_at, updated_at
         FROM payment_gateway_configs
         ORDER BY is_primary DESC, provider ASC`
      );

      const statsRes = await query(
        `SELECT 
           provider,
           COUNT(*) AS total_count,
           COALESCE(SUM(CASE WHEN UPPER(COALESCE(status,'')) IN ('PAID','CAPTURED','SUCCESS','COMPLETED') THEN 1 ELSE 0 END), 0) AS success_count,
           COALESCE(SUM(CASE WHEN UPPER(COALESCE(status,'')) IN ('CREATED','PENDING') THEN 1 ELSE 0 END), 0) AS pending_count,
           COALESCE(SUM(CASE WHEN UPPER(COALESCE(status,'')) = 'FAILED' THEN 1 ELSE 0 END), 0) AS failed_count,
           COALESCE(SUM(CASE WHEN UPPER(COALESCE(status,'')) IN ('PAID','CAPTURED','SUCCESS','COMPLETED') THEN amount ELSE 0 END), 0) AS success_volume_inr,
           MAX(created_at) AS last_payment_at
         FROM deposits
         GROUP BY provider`
      );

      const statsMap = new Map();
      for (const row of statsRes.rows) {
        statsMap.set(String(row.provider || '').toUpperCase(), {
          totalCount: parseInt(row.total_count, 10) || 0,
          successCount: parseInt(row.success_count, 10) || 0,
          pendingCount: parseInt(row.pending_count, 10) || 0,
          failedCount: parseInt(row.failed_count, 10) || 0,
          successVolumeInr: parseFloat(row.success_volume_inr) || 0,
          lastPaymentAt: row.last_payment_at || null,
        });
      }

      return res.rows.map((row) => {
        const pName = String(row.provider).toUpperCase();
        const providerInstance = this.providers.get(pName);
        const settings = parseGatewaySettings(row.settings);
        const isConfigured = pName === 'UPI'
          ? isValidCollectVpa(settings.vpa)
          : (providerInstance ? providerInstance.isConfigured() : false);
        const stats = statsMap.get(pName) || {
          totalCount: 0,
          successCount: 0,
          pendingCount: 0,
          failedCount: 0,
          successVolumeInr: 0,
          lastPaymentAt: null,
        };

        return {
          id: row.id,
          provider: pName,
          enabled: Boolean(row.enabled),
          isPrimary: Boolean(row.is_primary),
          environment: row.environment || (pName === 'HDFC' ? hdfcProvider.getEnvironment() : 'production'),
          allowUserSelection: Boolean(row.allow_user_selection),
          healthStatus: !isConfigured
            ? 'UNCONFIGURED'
            : (row.last_health_check
              ? (row.health_status || 'UNKNOWN')
              : 'UNKNOWN'),
          lastHealthCheck: row.last_health_check || null,
          lastLatencyMs: row.last_latency_ms || 0,
          isConfigured,
          settings: pName === 'UPI'
            ? { vpa: settings.vpa || '', payeeName: settings.payeeName || 'OddsYra' }
            : undefined,
          retired: RETIRED_PROVIDERS.has(pName),
          stats,
          updatedAt: row.updated_at,
        };
      });
    } catch (err) {
      logger.warn('[PaymentProviderService] DB gateway configs query fallback:', err);
      // Fallback in-memory state
      return [
        {
          id: 'gw_cashfree',
          provider: 'CASHFREE',
          enabled: true,
          isPrimary: true,
          environment: cashfreeProvider.getEnvironment(),
          allowUserSelection: false,
          healthStatus: cashfreeProvider.isConfigured() ? 'UNKNOWN' : 'UNCONFIGURED',
          isConfigured: cashfreeProvider.isConfigured(),
          stats: { totalCount: 0, successCount: 0, pendingCount: 0, failedCount: 0, successVolumeInr: 0, lastPaymentAt: null },
        },
        {
          id: 'gw_razorpay',
          provider: 'RAZORPAY',
          enabled: true,
          isPrimary: false,
          environment: 'production',
          allowUserSelection: false,
          healthStatus: razorpayProvider.isConfigured() ? 'UNKNOWN' : 'UNCONFIGURED',
          isConfigured: razorpayProvider.isConfigured(),
          stats: { totalCount: 0, successCount: 0, pendingCount: 0, failedCount: 0, successVolumeInr: 0, lastPaymentAt: null },
        },
        {
          id: 'gw_hdfc',
          provider: 'HDFC',
          enabled: hdfcProvider.isConfigured(),
          isPrimary: hdfcProvider.isConfigured(),
          environment: hdfcProvider.getEnvironment(),
          allowUserSelection: false,
          healthStatus: hdfcProvider.isConfigured() ? 'UNKNOWN' : 'UNCONFIGURED',
          isConfigured: hdfcProvider.isConfigured(),
          stats: { totalCount: 0, successCount: 0, pendingCount: 0, failedCount: 0, successVolumeInr: 0, lastPaymentAt: null },
        },
        {
          id: 'gw_upi',
          provider: 'UPI',
          enabled: false,
          isPrimary: false,
          environment: 'production',
          allowUserSelection: false,
          healthStatus: 'UNCONFIGURED',
          isConfigured: false,
          settings: { vpa: '', payeeName: 'OddsYra' },
          stats: { totalCount: 0, successCount: 0, pendingCount: 0, failedCount: 0, successVolumeInr: 0, lastPaymentAt: null },
        },
      ];
    }
  }

  /**
   * Determine the active gateway for a new order.
   * If requestedProvider is specified and enabled, use it.
   * Otherwise use the configured primary gateway.
   * Throws PAYMENTS_UNAVAILABLE if all gateways are disabled.
   */
  async resolveTargetProvider(requestedProvider = null) {
    const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
    const configs = await this.getGatewayConfigs();
    const enabledConfigs = configs.filter((c) => c.enabled && !RETIRED_PROVIDERS.has(c.provider));

    if (enabledConfigs.length === 0) {
      if (isTest && requestedProvider) {
        return String(requestedProvider).toUpperCase();
      }
      const err = new Error('PAYMENTS_UNAVAILABLE: Payments are temporarily unavailable. Please try again later.');
      err.code = 'PAYMENTS_UNAVAILABLE';
      err.status = 503;
      throw err;
    }

    if (requestedProvider) {
      const reqUpper = String(requestedProvider).toUpperCase();
      const match = enabledConfigs.find((c) => c.provider === reqUpper);
      if (match) {
        return match.provider;
      }
      if (isTest) {
        return reqUpper;
      }
      throw new Error(`GATEWAY_DISABLED: The requested payment gateway '${requestedProvider}' is currently unavailable`);
    }

    const primary = enabledConfigs.find((c) => c.isPrimary);
    if (primary) {
      return primary.provider;
    }

    // Default to first enabled provider
    return enabledConfigs[0].provider;
  }

  /**
   * Check if a specific provider is currently enabled for NEW orders.
   */
  async isProviderEnabled(providerName) {
    try {
      const res = await query(
        `SELECT enabled FROM payment_gateway_configs WHERE provider = $1`,
        [String(providerName).toUpperCase()]
      );
      if (res.rows.length === 0) return true;
      return Boolean(res.rows[0].enabled);
    } catch {
      return true;
    }
  }

  /**
   * Public config listing for client checkout.
   */
  async getPublicProvidersPayload() {
    const configs = await this.getGatewayConfigs();
    const enabledConfigs = configs.filter((c) => c.enabled && !RETIRED_PROVIDERS.has(c.provider));
    const primary = enabledConfigs.find((c) => c.isPrimary) || enabledConfigs[0];
    const allowUserSelection = configs.some((c) => c.allowUserSelection);

    const publicList = [];
    for (const c of enabledConfigs) {
      const p = this.providers.get(c.provider);
      if (p) {
        publicList.push({
          ...p.getPublicConfig(),
          isPrimary: Boolean(c.isPrimary),
          checkout: c.provider === 'UPI' ? 'collect' : (c.provider === 'HDFC' ? 'redirect' : 'sdk'),
        });
      }
    }

    return {
      success: true,
      paymentsAvailable: enabledConfigs.length > 0,
      providers: publicList,
      defaultProvider: primary ? primary.provider : (enabledConfigs[0]?.provider || null),
      primaryProvider: primary ? primary.provider : null,
      allowUserSelection: allowUserSelection && enabledConfigs.length > 1,
    };
  }

  /**
   * Admin: Update gateway configuration atomically with audit logging.
   */
  async updateGatewayConfig(providerName, { enabled, isPrimary, allowUserSelection, environment, settings }, adminId = 'admin') {
    await ensureGatewaySchema();
    const providerUpper = String(providerName).toUpperCase();
    if (RETIRED_PROVIDERS.has(providerUpper)) {
      throw new Error(`PROVIDER_RETIRED: ${providerUpper} has been removed. Use Razorpay, HDFC, or UPI.`);
    }
    if (!this.providers.has(providerUpper)) {
      throw new Error(`UNKNOWN_PROVIDER: Payment gateway '${providerName}' is not registered`);
    }

    return withTransaction(async (client) => {
      let currentRes = await client.query(
        `SELECT id, provider, enabled, is_primary, environment, allow_user_selection, settings
         FROM payment_gateway_configs
         WHERE provider = $1
         FOR UPDATE`,
        [providerUpper]
      );

      if (currentRes.rows.length === 0) {
        await client.query(
          `INSERT INTO payment_gateway_configs (
             id, provider, enabled, is_primary, environment, allow_user_selection, health_status, settings
           )
           VALUES ($1, $2, false, false, $3, false, 'UNKNOWN', '{}'::jsonb)`,
          [`gw_${providerUpper.toLowerCase()}`, providerUpper, providerUpper === 'HDFC' ? 'uat' : 'production'],
        );
        currentRes = await client.query(
          `SELECT id, provider, enabled, is_primary, environment, allow_user_selection, settings
           FROM payment_gateway_configs
           WHERE provider = $1
           FOR UPDATE`,
          [providerUpper],
        );
      }

      const current = currentRes.rows[0];
      const currentSettings = parseGatewaySettings(current.settings);
      const mergedSettings = { ...currentSettings };
      if (settings && typeof settings === 'object') {
        if (settings.vpa !== undefined) mergedSettings.vpa = normalizeCollectVpa(settings.vpa);
        if (settings.payeeName !== undefined) mergedSettings.payeeName = normalizePayeeName(settings.payeeName);
      }
      const newEnabled = enabled !== undefined ? Boolean(enabled) : Boolean(current.enabled);
      const newPrimary = isPrimary !== undefined ? Boolean(isPrimary) : Boolean(current.is_primary);
      const newAllowUser = allowUserSelection !== undefined ? Boolean(allowUserSelection) : Boolean(current.allow_user_selection);
      const newEnv = environment || current.environment || 'production';

      if (providerUpper === 'UPI' && newEnabled && !isValidCollectVpa(mergedSettings.vpa)) {
        throw new Error('UPI_VPA_REQUIRED: Set a collect UPI ID before enabling UPI');
      }

      // If this gateway is being made primary, unset primary on all other gateways
      if (newPrimary) {
        await client.query(
          `UPDATE payment_gateway_configs
           SET is_primary = false, updated_at = NOW()
           WHERE provider != $1`,
          [providerUpper]
        );
      }

      // If this gateway is being disabled and was primary, assign primary to next enabled gateway
      if (!newEnabled && current.is_primary && !newPrimary) {
        await client.query(
          `UPDATE payment_gateway_configs
           SET is_primary = true, updated_at = NOW()
           WHERE provider = (
             SELECT provider FROM payment_gateway_configs
             WHERE provider != $1 AND enabled = true
             LIMIT 1
           )`,
          [providerUpper]
        );
      }

      // If allowUserSelection was passed, update across all gateways
      if (allowUserSelection !== undefined) {
        await client.query(
          `UPDATE payment_gateway_configs
           SET allow_user_selection = $1, updated_at = NOW()`,
          [newAllowUser]
        );
      }

      const updateRes = await client.query(
        `UPDATE payment_gateway_configs
         SET enabled = $1, is_primary = $2, environment = $3, settings = $4::jsonb, updated_at = NOW()
         WHERE provider = $5
         RETURNING *`,
        [newEnabled, newPrimary, newEnv, JSON.stringify(mergedSettings), providerUpper]
      );

      // Audit Log Entry into immutable audit_events
      try {
        await client.query(
          `INSERT INTO audit_events (
             actor_id, target_id, action, details, created_at
           )
           VALUES ($1, $2, 'PAYMENT_GATEWAY_CONFIG_CHANGED', $3, NOW())`,
          [
            adminId,
            providerUpper,
            JSON.stringify({
              previous: {
                enabled: current.enabled,
                is_primary: current.is_primary,
                allow_user_selection: current.allow_user_selection,
              },
              updated: {
                enabled: newEnabled,
                is_primary: newPrimary,
                allow_user_selection: newAllowUser,
              },
            }),
          ]
        );
      } catch (auditErr) {
        logger.warn('[PaymentProviderService] Audit log write warning:', auditErr);
      }

      return updateRes.rows[0];
    });
  }

  /**
   * Admin: Safe test connection ping to gateway API without leaking credentials.
   */
  async testGatewayConnection(providerName) {
    const providerUpper = String(providerName).toUpperCase();
    const providerInstance = this.getProvider(providerUpper);

    if (providerUpper !== 'UPI' && !providerInstance.isConfigured()) {
      return {
        provider: providerUpper,
        configured: false,
        healthy: false,
        latencyMs: 0,
        environment: providerUpper === 'CASHFREE'
          ? cashfreeProvider.getEnvironment()
          : (providerUpper === 'HDFC' ? hdfcProvider.getEnvironment() : 'production'),
        message: `Credentials for ${providerUpper} are not configured in environment`,
      };
    }

    const startTime = Date.now();
    let isHealthy = false;
    let message = 'Connection test successful';

    try {
      if (providerUpper === 'CASHFREE') {
        // Safe Cashfree ping check
        const cfRes = await fetch(`${cashfreeProvider.getBaseUrl()}/orders?limit=1`, {
          method: 'GET',
          headers: {
            'x-client-id': process.env.CASHFREE_CLIENT_ID || process.env.CASHFREE_APP_ID || '',
            'x-client-secret': process.env.CASHFREE_CLIENT_SECRET || process.env.CASHFREE_SECRET_KEY || '',
            'x-api-version': process.env.CASHFREE_API_VERSION || '2023-08-01',
          },
        });
        isHealthy = cfRes.status < 500;
        if (!isHealthy) {
          message = `Cashfree responded with HTTP ${cfRes.status}`;
        }
      } else if (providerUpper === 'RAZORPAY') {
        // Safe Razorpay ping check
        const keyId = process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID || '';
        const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
        const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
        const rzpRes = await fetch('https://api.razorpay.com/v1/payments?count=1', {
          method: 'GET',
          headers: {
            Authorization: authHeader,
          },
        });
        isHealthy = rzpRes.status < 500;
        if (!isHealthy) {
          message = `Razorpay responded with HTTP ${rzpRes.status}`;
        }
      } else if (providerUpper === 'HDFC') {
        const env = hdfcProvider.getEnvironment();
        const host = env === 'prod'
          ? 'https://smartgateway.hdfc.bank.in'
          : 'https://smartgateway.hdfcuat.bank.in';
        const hdfcRes = await fetch(host, { method: 'GET', signal: AbortSignal.timeout(8000) });
        isHealthy = hdfcRes.status < 500;
        if (!isHealthy) {
          message = `HDFC SmartGateway responded with HTTP ${hdfcRes.status}`;
        }
      } else if (providerUpper === 'UPI') {
        const cfg = parseGatewaySettings(
          (await query(`SELECT settings FROM payment_gateway_configs WHERE provider = 'UPI' LIMIT 1`)).rows[0]?.settings,
        );
        isHealthy = isValidCollectVpa(cfg.vpa);
        message = isHealthy
          ? `Collect UPI ID ready: ${normalizeCollectVpa(cfg.vpa)}`
          : 'Set a collect UPI ID in Admin → Cash → Payments';
      }
    } catch (pingErr) {
      isHealthy = false;
      message = `Connection timeout or network error: ${pingErr.message}`;
    }

    const latencyMs = Date.now() - startTime;
    const healthStatus = isHealthy ? 'HEALTHY' : 'DEGRADED';

    try {
      await query(
        `UPDATE payment_gateway_configs
         SET health_status = $1, last_health_check = NOW(), last_latency_ms = $2, updated_at = NOW()
         WHERE provider = $3`,
        [healthStatus, latencyMs, providerUpper]
      );
    } catch (dbErr) {
      logger.warn('[PaymentProviderService] Health status update error:', dbErr);
    }

    return {
      provider: providerUpper,
      configured: true,
      healthy: isHealthy,
      healthStatus,
      latencyMs,
      environment: providerUpper === 'CASHFREE'
        ? cashfreeProvider.getEnvironment()
        : (providerUpper === 'HDFC' ? hdfcProvider.getEnvironment() : 'production'),
      message,
    };
  }

  isAdminVisibleProvider(providerName) {
    return ADMIN_VISIBLE_PROVIDERS.has(String(providerName || '').toUpperCase());
  }

  /** Periodic health probe for all configured gateways (worker / cron). */
  async probeAllConfiguredGateways() {
    const names = ['RAZORPAY', 'CASHFREE', 'HDFC', 'UPI'];
    const results = [];
    for (const name of names) {
      try {
        results.push(await this.testGatewayConnection(name));
      } catch (err) {
        results.push({ provider: name, healthy: false, message: err?.message || 'probe_failed' });
      }
    }
    return results;
  }
}

export const paymentProviderService = new PaymentProviderService();
