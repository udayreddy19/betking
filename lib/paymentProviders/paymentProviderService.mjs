import { query, withTransaction } from '../../db/pg.js';
import { razorpayProvider } from './RazorpayProvider.mjs';
import { cashfreeProvider } from './CashfreeProvider.mjs';
import { logger } from '../logger.mjs';

class PaymentProviderService {
  constructor() {
    this.providers = new Map();
    this.registerProvider(razorpayProvider);
    this.registerProvider(cashfreeProvider);
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
      const res = await query(
        `SELECT id, provider, enabled, is_primary, environment, allow_user_selection,
                health_status, last_health_check, last_latency_ms, created_at, updated_at
         FROM payment_gateway_configs
         ORDER BY is_primary DESC, provider ASC`
      );

      const statsRes = await query(
        `SELECT 
           provider,
           COUNT(*) AS total_count,
           COALESCE(SUM(CASE WHEN status = 'PAID' THEN 1 ELSE 0 END), 0) AS success_count,
           COALESCE(SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END), 0) AS pending_count,
           COALESCE(SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END), 0) AS failed_count,
           COALESCE(SUM(CASE WHEN status = 'PAID' THEN amount ELSE 0 END), 0) AS success_volume_inr,
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
        const isConfigured = providerInstance ? providerInstance.isConfigured() : false;
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
          environment: row.environment || 'production',
          allowUserSelection: Boolean(row.allow_user_selection),
          healthStatus: isConfigured ? (row.health_status || 'HEALTHY') : 'UNCONFIGURED',
          lastHealthCheck: row.last_health_check || null,
          lastLatencyMs: row.last_latency_ms || 0,
          isConfigured,
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
          healthStatus: cashfreeProvider.isConfigured() ? 'HEALTHY' : 'UNCONFIGURED',
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
          healthStatus: razorpayProvider.isConfigured() ? 'HEALTHY' : 'UNCONFIGURED',
          isConfigured: razorpayProvider.isConfigured(),
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
    const configs = await this.getGatewayConfigs();
    const enabledConfigs = configs.filter((c) => c.enabled);

    if (enabledConfigs.length === 0) {
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
    const enabledConfigs = configs.filter((c) => c.enabled);
    const primary = enabledConfigs.find((c) => c.isPrimary) || enabledConfigs[0];
    const allowUserSelection = configs.some((c) => c.allowUserSelection);

    const publicList = [];
    for (const c of enabledConfigs) {
      const p = this.providers.get(c.provider);
      if (p) {
        publicList.push({
          ...p.getPublicConfig(),
          isPrimary: Boolean(c.isPrimary),
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
  async updateGatewayConfig(providerName, { enabled, isPrimary, allowUserSelection, environment }, adminId = 'admin') {
    const providerUpper = String(providerName).toUpperCase();
    if (!this.providers.has(providerUpper)) {
      throw new Error(`UNKNOWN_PROVIDER: Payment gateway '${providerName}' is not registered`);
    }

    return withTransaction(async (client) => {
      const currentRes = await client.query(
        `SELECT id, provider, enabled, is_primary, environment, allow_user_selection
         FROM payment_gateway_configs
         WHERE provider = $1
         FOR UPDATE`,
        [providerUpper]
      );

      if (currentRes.rows.length === 0) {
        throw new Error(`GATEWAY_CONFIG_NOT_FOUND: Configuration for '${providerUpper}' does not exist`);
      }

      const current = currentRes.rows[0];
      const newEnabled = enabled !== undefined ? Boolean(enabled) : Boolean(current.enabled);
      const newPrimary = isPrimary !== undefined ? Boolean(isPrimary) : Boolean(current.is_primary);
      const newAllowUser = allowUserSelection !== undefined ? Boolean(allowUserSelection) : Boolean(current.allow_user_selection);
      const newEnv = environment || current.environment || 'production';

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
         SET enabled = $1, is_primary = $2, environment = $3, updated_at = NOW()
         WHERE provider = $4
         RETURNING *`,
        [newEnabled, newPrimary, newEnv, providerUpper]
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

    if (!providerInstance.isConfigured()) {
      return {
        provider: providerUpper,
        configured: false,
        healthy: false,
        latencyMs: 0,
        environment: providerUpper === 'CASHFREE' ? cashfreeProvider.getEnvironment() : 'production',
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
      environment: providerUpper === 'CASHFREE' ? cashfreeProvider.getEnvironment() : 'production',
      message,
    };
  }
}

export const paymentProviderService = new PaymentProviderService();
