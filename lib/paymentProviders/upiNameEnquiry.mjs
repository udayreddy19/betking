/**
 * Optional live UPI name enquiry via payment providers.
 * Returns null/throws when not configured — caller falls back to simulate.
 */

export async function tryLiveUpiNameEnquiry({ vpa, userId } = {}) {
  const key = process.env.CASHFREE_CLIENT_ID || process.env.RAZORPAY_KEY_ID;
  if (!key) {
    return { ok: false, error: 'no_psp_credentials' };
  }
  // Provider-specific integration points land here when KYC/name APIs are enabled.
  // Until then, signal unavailable so verifyUpiBeneficiary can simulate safely.
  return {
    ok: false,
    error: 'upi_name_enquiry_not_wired',
    vpa,
    userId,
  };
}
