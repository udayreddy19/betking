import { PaymentProvider } from './PaymentProvider.mjs';
import {
  buildUpiPayUri,
  isValidCollectVpa,
  loadUpiCollectSettings,
  upiUriToQrDataUrl,
} from './upiCollect.mjs';

export class UpiProvider extends PaymentProvider {
  constructor() {
    super('UPI');
  }

  isConfigured() {
    return true;
  }

  getEnvironment() {
    return 'production';
  }

  getPublicConfig() {
    return {
      provider: 'UPI',
      enabled: true,
      checkout: 'collect',
    };
  }

  async createOrder({
    orderId,
    amount,
    amountPaise,
    currency = 'INR',
  } = {}) {
    const cfg = await loadUpiCollectSettings();
    if (!isValidCollectVpa(cfg.vpa)) {
      throw new Error('CONFIG_ERROR: Set a collect UPI ID in Admin → Cash → Payments before enabling UPI');
    }
    const upiUri = buildUpiPayUri({
      vpa: cfg.vpa,
      payeeName: cfg.payeeName,
      amountInr: amount,
      note: orderId,
    });
    let qrDataUrl = '';
    try {
      qrDataUrl = await upiUriToQrDataUrl(upiUri);
    } catch {
      qrDataUrl = '';
    }
    return {
      orderId,
      providerOrderId: orderId,
      amount,
      amountPaise,
      currency,
      checkout: 'collect',
      vpa: cfg.vpa,
      payeeName: cfg.payeeName,
      upiUri,
      qrDataUrl,
    };
  }

  async fetchPaymentStatus() {
    return { status: 'PENDING', method: 'upi' };
  }

  verifyPaymentSignature() {
    return false;
  }

  verifyWebhookSignature() {
    return false;
  }

  parseWebhookEvent() {
    return { handled: false };
  }
}

export const upiProvider = new UpiProvider();
