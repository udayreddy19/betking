/**
 * LEGACY STUB — DO NOT IMPORT.
 * Real payments: lib/depositEngine.mjs, lib/withdrawalEngine.mjs, lib/razorpayRefundEngine.mjs
 */
export function routePaymentTransaction() {
  throw Object.assign(
    new Error('lib/paymentHub.mjs is a deprecated stub. Use depositEngine / withdrawalEngine / razorpayRefundEngine.'),
    { code: 'PAYMENT_HUB_DEPRECATED', status: 500 },
  );
}

export default { routePaymentTransaction };

