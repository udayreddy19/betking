/**
 * Base Payment Provider Interface
 * Defines standard contracts for payment gateways (Razorpay, Cashfree, etc.)
 */
export class PaymentProvider {
  constructor(name) {
    this.name = name;
  }

  isConfigured() {
    throw new Error('METHOD_NOT_IMPLEMENTED: isConfigured()');
  }

  async createOrder(params, correlationId = null) {
    throw new Error('METHOD_NOT_IMPLEMENTED: createOrder()');
  }

  async fetchPaymentStatus(orderId, paymentId = null, correlationId = null) {
    throw new Error('METHOD_NOT_IMPLEMENTED: fetchPaymentStatus()');
  }

  verifyPaymentSignature(params) {
    throw new Error('METHOD_NOT_IMPLEMENTED: verifyPaymentSignature()');
  }

  verifyWebhookSignature(params) {
    throw new Error('METHOD_NOT_IMPLEMENTED: verifyWebhookSignature()');
  }

  parseWebhookEvent(body, headers) {
    throw new Error('METHOD_NOT_IMPLEMENTED: parseWebhookEvent()');
  }
}
