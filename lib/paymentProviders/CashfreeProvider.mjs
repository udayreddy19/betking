import crypto from 'crypto';
import { PaymentProvider } from './PaymentProvider.mjs';
import { timingSafeEqualStrings } from '../cryptoUtils.mjs';
import { logger } from '../logger.mjs';

function getCashfreeCredentials() {
  const client_id = process.env.CASHFREE_CLIENT_ID || process.env.CASHFREE_APP_ID;
  const client_secret = process.env.CASHFREE_CLIENT_SECRET || process.env.CASHFREE_SECRET_KEY;
  const environment = (process.env.CASHFREE_ENVIRONMENT || 'sandbox').toLowerCase();
  const api_version = process.env.CASHFREE_API_VERSION || '2023-08-01';
  return { client_id, client_secret, environment, api_version };
}

function getCashfreeWebhookSecret() {
  return process.env.CASHFREE_WEBHOOK_SECRET || process.env.CASHFREE_CLIENT_SECRET || process.env.CASHFREE_SECRET_KEY;
}

export class CashfreeProvider extends PaymentProvider {
  constructor() {
    super('CASHFREE');
  }

  isConfigured() {
    const { client_id, client_secret } = getCashfreeCredentials();
    return Boolean(client_id && client_secret);
  }

  getEnvironment() {
    const { environment } = getCashfreeCredentials();
    return environment === 'production' || environment === 'prod' ? 'production' : 'sandbox';
  }

  getBaseUrl() {
    return this.getEnvironment() === 'production'
      ? 'https://api.cashfree.com/pg'
      : 'https://sandbox.cashfree.com/pg';
  }

  getPublicConfig() {
    const { client_id } = getCashfreeCredentials();
    return {
      provider: 'CASHFREE',
      enabled: this.isConfigured() || process.env.NODE_ENV !== 'production',
      environment: this.getEnvironment(),
      appId: client_id ? `${client_id.slice(0, 8)}...` : undefined,
    };
  }

  async callApi(endpoint, options = {}) {
    const { client_id, client_secret, api_version } = getCashfreeCredentials();
    const url = `${this.getBaseUrl()}${endpoint}`;

    const headers = {
      'Content-Type': 'application/json',
      'x-client-id': client_id,
      'x-client-secret': client_secret,
      'x-api-version': api_version,
      ...(options.headers || {}),
    };

    const res = await fetch(url, {
      ...options,
      headers,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errorMsg = data.message || data.error_description || data.error || `Cashfree HTTP ${res.status}`;
      const err = new Error(`CASHFREE_API_ERROR: ${errorMsg}`);
      err.status = res.status;
      err.details = data;
      err.code = data.code || data.type || 'CASHFREE_ERROR';
      throw err;
    }
    return data;
  }

  /**
   * Cashfree Webhook Signature Verification
   * Official Algorithm: Base64(HMAC-SHA256(timestamp + rawBody, webhook_secret))
   */
  verifyWebhookSignature({ rawBody, headers }) {
    const signature = headers?.['x-webhook-signature'] || headers?.['x-cf-signature'];
    const timestamp = headers?.['x-webhook-timestamp'] || headers?.['x-cf-timestamp'];

    if (!signature || !timestamp) {
      return false;
    }

    const secret = getCashfreeWebhookSecret();
    if (!secret) {
      if (process.env.NODE_ENV === 'test') return true;
      throw new Error('CONFIG_ERROR: CASHFREE_WEBHOOK_SECRET is not configured');
    }

    const rawString = Buffer.isBuffer(rawBody)
      ? rawBody.toString('utf8')
      : typeof rawBody === 'string'
        ? rawBody
        : JSON.stringify(rawBody || '');

    const signedPayload = String(timestamp) + rawString;

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(signedPayload)
      .digest('base64');

    return timingSafeEqualStrings(expectedSignature, String(signature));
  }

  /**
   * Create Cashfree Order
   * Generates order_id and payment_session_id server-side
   */
  async createOrder({
    userId,
    orderId,
    amount,
    amountPaise,
    currency = 'INR',
    customer = {},
    returnUrl,
    notifyUrl,
  }, correlationId = null) {
    const { client_id, client_secret } = getCashfreeCredentials();
    const effectiveOrderId = orderId || `dep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const numericAmount = parseFloat(amount);

    if (process.env.NODE_ENV === 'test' || !client_id || !client_secret) {
      if (process.env.NODE_ENV === 'production' && (!client_id || !client_secret)) {
        throw new Error('CONFIG_ERROR: Cashfree credentials are required in production');
      }

      const mockSessionId = `session_mock_cf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      return {
        provider: 'CASHFREE',
        orderId: effectiveOrderId,
        providerOrderId: effectiveOrderId,
        cfOrderId: `cf_mock_${Date.now()}`,
        paymentSessionId: mockSessionId,
        amount: numericAmount,
        amountPaise,
        currency,
        environment: this.getEnvironment(),
      };
    }

    const customerPhone = String(customer.phone || '9999999999').replace(/\D/g, '').slice(0, 10) || '9999999999';
    const customerEmail = customer.email || `${userId}@oddsyra.com`;
    const customerName = customer.displayName || customer.name || `User ${userId}`;

    try {
      const orderPayload = {
        order_id: effectiveOrderId,
        order_amount: numericAmount,
        order_currency: currency,
        customer_details: {
          customer_id: String(userId),
          customer_email: customerEmail,
          customer_phone: customerPhone,
          customer_name: customerName,
        },
        order_meta: {
          return_url: returnUrl || `https://oddsyra.com/wallet?cf_order_id={order_id}`,
          notify_url: notifyUrl || `https://oddsyra.com/api/webhooks/cashfree`,
        },
        order_note: 'ODDSYRA Deposit',
        order_tags: {
          userId: String(userId),
          platform: 'ODDSYRA',
        },
      };

      const orderData = await this.callApi('/orders', {
        method: 'POST',
        body: JSON.stringify(orderPayload),
      });

      return {
        provider: 'CASHFREE',
        orderId: orderData.order_id || effectiveOrderId,
        providerOrderId: orderData.order_id || effectiveOrderId,
        cfOrderId: String(orderData.cf_order_id || ''),
        paymentSessionId: orderData.payment_session_id,
        amount: Number(orderData.order_amount || numericAmount),
        amountPaise,
        currency: orderData.order_currency || currency,
        environment: this.getEnvironment(),
      };
    } catch (cfErr) {
      logger.error('[CashfreeProvider] Order creation failed:', { error: cfErr.message, details: cfErr.details });
      const description = cfErr?.details?.message || cfErr?.message || 'Cashfree order creation failed';
      const err = new Error(`CASHFREE_ORDER_FAILED: ${description}`);
      err.code = 'CASHFREE_ORDER_FAILED';
      err.status = cfErr.status || 502;
      err.cause = cfErr;
      throw err;
    }
  }

  /**
   * Fetch Order & Payment Status from Cashfree API
   */
  async fetchPaymentStatus(orderId, paymentId = null) {
    const { client_id, client_secret } = getCashfreeCredentials();
    if (!client_id || !client_secret) {
      if (process.env.NODE_ENV === 'test') {
        return {
          orderId,
          paymentId: paymentId || `cf_pay_test_${Date.now()}`,
          status: 'SUCCESS',
          amountInINR: null,
          method: 'upi',
          utr: paymentId || `utr_${Date.now()}`,
        };
      }
      throw new Error('CONFIG_ERROR: Cashfree credentials not configured');
    }

    try {
      // 1. Fetch Order Status
      const order = await this.callApi(`/orders/${encodeURIComponent(orderId)}`, { method: 'GET' });
      const orderStatus = String(order.order_status || '').toUpperCase();

      // 2. Fetch Payments for this Order
      const payments = await this.callApi(`/orders/${encodeURIComponent(orderId)}/payments`, { method: 'GET' });
      const paymentList = Array.isArray(payments) ? payments : [];

      let matchingPayment = null;
      if (paymentId) {
        matchingPayment = paymentList.find(p => String(p.cf_payment_id) === String(paymentId));
      }
      if (!matchingPayment) {
        matchingPayment = paymentList.find(p => String(p.payment_status).toUpperCase() === 'SUCCESS') || paymentList[0];
      }

      if (!matchingPayment) {
        return {
          orderId,
          status: orderStatus === 'PAID' ? 'SUCCESS' : (orderStatus === 'EXPIRED' ? 'EXPIRED' : 'PENDING'),
          amountInINR: order.order_amount ? parseFloat(Number(order.order_amount).toFixed(2)) : null,
          currency: order.order_currency || 'INR',
          payments: [],
        };
      }

      const pStatus = String(matchingPayment.payment_status || '').toUpperCase();
      const resolvedStatus = pStatus === 'SUCCESS' ? 'SUCCESS' : (pStatus === 'FAILED' ? 'FAILED' : 'PENDING');
      const pAmount = Number(matchingPayment.payment_amount || order.order_amount || 0);

      const method = matchingPayment.payment_group || matchingPayment.payment_method?.upi ? 'upi' : 'netbanking';
      const utr = matchingPayment.bank_reference || matchingPayment.cf_payment_id;

      return {
        orderId: matchingPayment.order_id || orderId,
        paymentId: String(matchingPayment.cf_payment_id),
        status: resolvedStatus,
        amountInINR: parseFloat(pAmount.toFixed(2)),
        amountPaise: Math.round(pAmount * 100),
        currency: matchingPayment.payment_currency || order.order_currency || 'INR',
        method,
        utr,
        raw: { order, payment: matchingPayment },
      };
    } catch (err) {
      logger.error('[CashfreeProvider] Failed to fetch payment status:', { orderId, error: err.message });
      throw err;
    }
  }

  /**
   * Parse Cashfree Webhook Payload
   */
  parseWebhookEvent(body, headers) {
    const type = body?.type || body?.event || 'PAYMENT_SUCCESS_WEBHOOK';
    const data = body?.data || body;
    const order = data?.order;
    const payment = data?.payment;
    const customer = data?.customer_details;

    const orderId = order?.order_id || data?.order_id;
    const paymentId = payment?.cf_payment_id ? String(payment.cf_payment_id) : (data?.cf_payment_id ? String(data.cf_payment_id) : null);
    const paymentStatus = payment?.payment_status ? String(payment.payment_status).toUpperCase() : (type.includes('SUCCESS') ? 'SUCCESS' : 'OTHER');

    const amountInINR = payment?.payment_amount != null
      ? parseFloat(Number(payment.payment_amount).toFixed(2))
      : (order?.order_amount != null ? parseFloat(Number(order.order_amount).toFixed(2)) : null);

    const amountPaise = amountInINR != null ? Math.round(amountInINR * 100) : null;
    const utr = payment?.bank_reference || paymentId;

    const providerEventId = paymentId
      ? `evt_cf_${paymentId}_${type}`
      : `evt_cf_${orderId || Date.now()}_${type}`;

    return {
      provider: 'CASHFREE',
      event: type,
      providerEventId,
      orderId,
      paymentId,
      status: paymentStatus === 'SUCCESS' ? 'SUCCESS' : (paymentStatus === 'FAILED' ? 'FAILED' : 'OTHER'),
      amountInINR,
      amountPaise,
      currency: payment?.payment_currency || order?.order_currency || 'INR',
      userId: customer?.customer_id,
      method: payment?.payment_group || 'upi',
      utr,
      raw: body,
    };
  }
}

export const cashfreeProvider = new CashfreeProvider();
