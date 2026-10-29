import crypto from 'crypto';
import { PaymentProvider } from './PaymentProvider.mjs';
import { hdfcCustomerId, hdfcOrderId } from './hdfcIds.mjs';
import { inquireHdfcOrderTwice } from './hdfcStatus.mjs';
import { logger } from '../logger.mjs';

function str(v) {
  return String(v || '').trim();
}

function usable(v) {
  const s = str(v);
  return Boolean(s) && s.length >= 8 && !/\*/.test(s) && !s.startsWith('CONFIGURE_ME');
}

function hdfcHost() {
  return String(process.env.HDFC_SG_ENV || 'uat').toLowerCase() === 'prod'
    ? 'https://smartgateway.hdfc.bank.in'
    : 'https://smartgateway.hdfcuat.bank.in';
}

function credentials() {
  return {
    merchantId: str(process.env.HDFC_SG_MERCHANT_ID),
    clientId: str(process.env.HDFC_SG_CLIENT_ID),
    apiKey: usable(process.env.HDFC_SG_API_KEY) ? str(process.env.HDFC_SG_API_KEY) : '',
    responseKey: usable(process.env.HDFC_SG_RESPONSE_KEY) ? str(process.env.HDFC_SG_RESPONSE_KEY) : '',
    environment: String(process.env.HDFC_SG_ENV || 'uat').toLowerCase() === 'prod' ? 'prod' : 'uat',
  };
}

function appBase() {
  return str(process.env.APP_URL || process.env.FRONTEND_URL || 'https://oddsyra.com').replace(/\/$/, '');
}

function basicAuth(apiKey) {
  return `Basic ${Buffer.from(`${apiKey}:`, 'utf8').toString('base64')}`;
}

export class HdfcProvider extends PaymentProvider {
  constructor() {
    super('HDFC');
  }

  isConfigured() {
    const c = credentials();
    return Boolean(c.merchantId && c.clientId && c.apiKey);
  }

  getEnvironment() {
    return credentials().environment;
  }

  getPublicConfig() {
    const c = credentials();
    return {
      provider: 'HDFC',
      enabled: this.isConfigured(),
      environment: c.environment,
      checkout: 'redirect',
    };
  }

  async callApi(path, { method = 'GET', body, customerId } = {}) {
    const c = credentials();
    if (!this.isConfigured()) {
      throw new Error('CONFIG_ERROR: HDFC SmartGateway is not configured');
    }
    const res = await fetch(`${hdfcHost()}${path}`, {
      method,
      headers: {
        Authorization: basicAuth(c.apiKey),
        'x-merchantid': c.merchantId,
        ...(customerId ? { 'x-customerid': String(customerId).slice(0, 64) } : {}),
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(json?.error_info?.developer_message || json?.error_message || `HDFC HTTP ${res.status}`);
      err.status = 502;
      err.details = json;
      throw err;
    }
    return json;
  }

  async createOrder({
    userId,
    amount,
    amountPaise,
    currency = 'INR',
    customer = {},
    returnUrl,
  }) {
    if (!this.isConfigured()) {
      throw new Error('CONFIG_ERROR: HDFC SmartGateway credentials are required');
    }
    const orderId = hdfcOrderId();
    const customerId = hdfcCustomerId(userId);
    const phone = String(customer.phone || '').replace(/\D/g, '').slice(-10);
    const sessionReturn = returnUrl
      || `${appBase()}/api/payments/hdfc-return/${encodeURIComponent(orderId)}`;
    const json = await this.callApi('/session', {
      method: 'POST',
      customerId,
      body: {
        order_id: orderId,
        amount: Number(amount).toFixed(2),
        currency,
        customer_id: customerId,
        customer_email: customer.email || undefined,
        customer_phone: phone || undefined,
        payment_page_client_id: credentials().clientId,
        action: 'paymentPage',
        return_url: sessionReturn.includes(orderId)
          ? sessionReturn
          : `${sessionReturn.replace(/\/$/, '')}/${encodeURIComponent(orderId)}`,
        description: 'OddsYra wallet deposit',
        first_name: String(customer.displayName || customer.name || 'Customer').slice(0, 40),
        source_object: 'PAYMENT_LINK',
        'metadata.expiryInMins': '60',
      },
    });
    const payUrl = json?.payment_links?.web;
    if (!payUrl) {
      const err = new Error('HDFC_ORDER_FAILED: HDFC did not return a payment link');
      err.code = 'HDFC_ORDER_FAILED';
      err.status = 502;
      throw err;
    }
    logger.info('[HdfcProvider] session created', { orderId, userId });
    return {
      provider: 'HDFC',
      orderId: json.order_id || orderId,
      providerOrderId: json.order_id || orderId,
      payUrl,
      redirectUrl: payUrl,
      amount,
      amountPaise,
      currency,
      environment: this.getEnvironment(),
    };
  }

  async fetchPaymentStatus(orderId) {
    const st = await inquireHdfcOrderTwice(
      () => this.callApi(`/orders/${encodeURIComponent(orderId)}`),
      orderId,
    );
    return {
      orderId: st.orderId || orderId,
      paymentId: st.txnId,
      status: st.charged ? 'SUCCESS' : (st.terminalFail ? 'FAILED' : (st.status || 'PENDING')),
      amountInINR: st.amountInr,
      amountPaise: st.amountInr != null ? Math.round(Number(st.amountInr) * 100) : null,
      currency: 'INR',
      method: 'card',
      utr: st.txnId,
      raw: st.raw,
    };
  }

  verifyPaymentSignature() {
    return true;
  }

  verifyWebhookSignature({ rawBody, headers = {}, signature } = {}) {
    const { responseKey } = credentials();
    if (!responseKey) return true;
    const sig = signature || headers['x-webhook-signature'] || headers['authorization-hash'] || headers['Authorization-Hash'];
    if (!sig) return false;
    const body = rawBody == null ? '' : Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
    const expected = crypto.createHmac('sha256', responseKey).update(body).digest('hex');
    const a = Buffer.from(String(sig).toLowerCase());
    const b = Buffer.from(expected.toLowerCase());
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  parseWebhookEvent(body) {
    const payload = body?.payload || body || {};
    const status = String(payload.status || payload.event_name || '').toUpperCase();
    const charged = status === 'CHARGED' || status.includes('CHARGED');
    const orderId = payload.order_id || payload.orderId;
    return {
      provider: 'HDFC',
      event: status,
      providerEventId: String(payload.event_id || payload.txn_id || payload.id || `${orderId}:${status}`).slice(0, 120),
      orderId,
      paymentId: payload.txn_id || payload.payment_id || payload.id,
      status: charged ? 'SUCCESS' : (status.includes('FAIL') ? 'FAILED' : 'OTHER'),
      amountInINR: payload.amount != null ? Number(payload.amount) : null,
      amountPaise: payload.amount != null ? Math.round(Number(payload.amount) * 100) : null,
      currency: payload.currency || 'INR',
      method: payload.payment_method_type || 'card',
      utr: payload.txn_id || payload.txn_uuid,
      raw: body,
    };
  }
}

export const hdfcProvider = new HdfcProvider();
