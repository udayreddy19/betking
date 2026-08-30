import crypto from 'crypto';
import { PaymentProvider } from './PaymentProvider.mjs';
import { timingSafeEqualStrings } from '../cryptoUtils.mjs';
import { logger } from '../logger.mjs';

function getRazorpayCredentials() {
  const key_id = process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  return { key_id, key_secret };
}

function getRazorpayWebhookSecret() {
  return process.env.RAZORPAY_WEBHOOK_SECRET;
}

export class RazorpayProvider extends PaymentProvider {
  constructor() {
    super('RAZORPAY');
  }

  isConfigured() {
    const { key_id, key_secret } = getRazorpayCredentials();
    return Boolean(key_id && key_secret);
  }

  getPublicConfig() {
    const { key_id } = getRazorpayCredentials();
    return {
      provider: 'RAZORPAY',
      enabled: this.isConfigured() || process.env.NODE_ENV !== 'production',
      keyId: key_id || 'rzp_test_public_key',
    };
  }

  async callApi(endpoint, options = {}) {
    const { key_id, key_secret } = getRazorpayCredentials();
    const authHeader = 'Basic ' + Buffer.from(`${key_id}:${key_secret}`).toString('base64');
    const url = `https://api.razorpay.com/v1${endpoint}`;

    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
        ...(options.headers || {}),
      },
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errorMsg = data.error?.description || data.error?.reason || data.message || `Razorpay HTTP ${res.status}`;
      const err = new Error(`RAZORPAY_API_ERROR: ${errorMsg}`);
      err.status = res.status;
      err.details = data;
      throw err;
    }
    return data;
  }

  verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return false;
    }
    const { key_secret } = getRazorpayCredentials();
    if (!key_secret) {
      if (process.env.NODE_ENV === 'test') return true;
      throw new Error('CONFIG_ERROR: RAZORPAY_KEY_SECRET is not configured');
    }

    const payload = `${razorpayOrderId}|${razorpayPaymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', key_secret)
      .update(payload)
      .digest('hex');

    return timingSafeEqualStrings(expectedSignature, String(razorpaySignature));
  }

  verifyWebhookSignature({ rawBody, signature }) {
    if (!signature) {
      return false;
    }
    const webhookSecret = getRazorpayWebhookSecret();
    if (!webhookSecret) {
      if (process.env.NODE_ENV === 'test') return true;
      throw new Error('CONFIG_ERROR: RAZORPAY_WEBHOOK_SECRET is not configured');
    }

    const rawBuffer = Buffer.isBuffer(rawBody)
      ? rawBody
      : typeof rawBody === 'string'
        ? Buffer.from(rawBody, 'utf8')
        : Buffer.from(JSON.stringify(rawBody || ''), 'utf8');

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBuffer)
      .digest('hex');

    return timingSafeEqualStrings(expectedSignature, String(signature));
  }

  async createOrder({ userId, amount, amountPaise, currency = 'INR' }, correlationId = null) {
    const { key_id, key_secret } = getRazorpayCredentials();
    let razorpayOrderId;

    if (process.env.NODE_ENV === 'test' || !key_id || !key_secret) {
      if (process.env.NODE_ENV === 'production' && (!key_id || !key_secret)) {
        throw new Error('CONFIG_ERROR: Razorpay credentials are required in production');
      }
      razorpayOrderId = `order_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    } else {
      try {
        const order = await this.callApi('/orders', {
          method: 'POST',
          body: JSON.stringify({
            amount: amountPaise,
            currency,
            receipt: `rcpt_${userId}_${Date.now()}`,
            notes: { userId },
          }),
        });
        razorpayOrderId = order.id;
      } catch (rzpErr) {
        const description = rzpErr?.details?.error?.description
          || rzpErr?.message
          || 'Razorpay order creation failed';
        const err = new Error(`RAZORPAY_ORDER_FAILED: ${description}`);
        err.code = 'RAZORPAY_ORDER_FAILED';
        err.status = rzpErr.status || 502;
        err.cause = rzpErr;
        throw err;
      }
    }

    return {
      provider: 'RAZORPAY',
      orderId: razorpayOrderId,
      providerOrderId: razorpayOrderId,
      keyId: key_id || 'rzp_test_public_key',
      amount,
      amountPaise,
      currency,
    };
  }

  async fetchPaymentStatus(orderId, paymentId = null) {
    const { key_id, key_secret } = getRazorpayCredentials();
    if (!key_id || !key_secret) {
      if (process.env.NODE_ENV === 'test') {
        return {
          orderId,
          paymentId: paymentId || `pay_test_${Date.now()}`,
          status: 'captured',
          amount: null,
          method: 'upi',
          utr: paymentId || `utr_${Date.now()}`,
        };
      }
      throw new Error('CONFIG_ERROR: Razorpay credentials not configured');
    }

    if (paymentId) {
      const payment = await this.callApi(`/payments/${encodeURIComponent(paymentId)}`, { method: 'GET' });
      return {
        orderId: payment.order_id || orderId,
        paymentId: payment.id,
        status: String(payment.status || '').toLowerCase(),
        amountInINR: parseFloat((Number(payment.amount) / 100).toFixed(2)),
        amountPaise: Number(payment.amount),
        currency: payment.currency || 'INR',
        method: payment.method || 'upi',
        utr: payment.acquirer_data?.rrn || payment.acquirer_data?.upi_transaction_id || payment.id,
        raw: payment,
      };
    }

    const order = await this.callApi(`/orders/${encodeURIComponent(orderId)}/payments`, { method: 'GET' });
    const payments = Array.isArray(order.items) ? order.items : [];
    const successfulPayment = payments.find(p => p.status === 'captured' || p.status === 'authorized') || payments[0];
    if (!successfulPayment) {
      return { orderId, status: 'pending', payments: [] };
    }

    return {
      orderId,
      paymentId: successfulPayment.id,
      status: String(successfulPayment.status || '').toLowerCase(),
      amountInINR: parseFloat((Number(successfulPayment.amount) / 100).toFixed(2)),
      amountPaise: Number(successfulPayment.amount),
      currency: successfulPayment.currency || 'INR',
      method: successfulPayment.method || 'upi',
      utr: successfulPayment.acquirer_data?.rrn || successfulPayment.acquirer_data?.upi_transaction_id || successfulPayment.id,
      raw: successfulPayment,
    };
  }

  parseWebhookEvent(body, headers) {
    const event = body?.event;
    const payload = body?.payload;
    const payment = payload?.payment?.entity;

    return {
      provider: 'RAZORPAY',
      event,
      providerEventId: payment?.id
        ? `evt_rzp_${payment.id}_${event}`
        : `evt_rzp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      orderId: payment?.order_id,
      paymentId: payment?.id,
      status: event === 'payment.captured' || event === 'order.paid' ? 'SUCCESS' : (event === 'payment.failed' ? 'FAILED' : 'OTHER'),
      amountInINR: payment?.amount ? parseFloat((Number(payment.amount) / 100).toFixed(2)) : null,
      amountPaise: payment?.amount ? Number(payment.amount) : null,
      currency: payment?.currency || 'INR',
      userId: payment?.notes?.userId,
      method: payment?.method || 'upi',
      utr: payment?.acquirer_data?.rrn || payment?.acquirer_data?.upi_transaction_id || payment?.id,
      raw: body,
    };
  }
}

export const razorpayProvider = new RazorpayProvider();
