import { razorpayProvider } from './RazorpayProvider.mjs';
import { cashfreeProvider } from './CashfreeProvider.mjs';

class PaymentProviderService {
  constructor() {
    this.providers = new Map();
    this.registerProvider(razorpayProvider);
    this.registerProvider(cashfreeProvider);
  }

  registerProvider(providerInstance) {
    this.providers.set(providerInstance.name.toUpperCase(), providerInstance);
  }

  getProvider(providerName = 'CASHFREE') {
    const key = String(providerName || '').toUpperCase();
    const provider = this.providers.get(key);
    if (!provider) {
      throw new Error(`UNKNOWN_PAYMENT_PROVIDER: Payment provider '${providerName}' is not registered`);
    }
    return provider;
  }

  getAvailableProviders() {
    const list = [];
    for (const [name, provider] of this.providers.entries()) {
      list.push(provider.getPublicConfig());
    }
    return list;
  }

  getDefaultProvider() {
    if (cashfreeProvider.isConfigured()) return 'CASHFREE';
    if (razorpayProvider.isConfigured()) return 'RAZORPAY';
    return 'CASHFREE';
  }
}

export const paymentProviderService = new PaymentProviderService();
