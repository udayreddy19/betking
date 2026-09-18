/**
 * UPI VPA verification + optional penny-drop simulation.
 * Real bank name-enquiry needs a PSP; until then SIMULATE mode + KYC name attach.
 */

import crypto from 'crypto';
import { query } from '../db/pg.js';
import { UPI_VPA_RE, normalizeNameForMatch } from './beneficiaryKycNameMatch.mjs';
import { logger } from './logger.mjs';

export function getUpiPennyDropMode() {
  const raw = String(process.env.UPI_PENNY_DROP_MODE || 'simulate').toLowerCase();
  if (['off', 'disabled', '0', 'false'].includes(raw)) return 'off';
  if (['live', 'provider'].includes(raw)) return 'live';
  return 'simulate';
}

export function isValidUpiVpa(vpa) {
  return UPI_VPA_RE.test(String(vpa || '').trim().toLowerCase());
}

/**
 * Verify (or simulate) a user's UPI VPA before withdrawal payout.
 * Returns { ok, status, beneficiaryName, verificationId, reason }.
 */
export async function verifyUpiBeneficiary({
  userId,
  vpa,
  declaredName = null,
} = {}) {
  const mode = getUpiPennyDropMode();
  const normalized = String(vpa || '').trim().toLowerCase();
  if (!userId || !isValidUpiVpa(normalized)) {
    return { ok: false, status: 'FAILED', reason: 'invalid_vpa' };
  }

  if (mode === 'off') {
    return { ok: true, status: 'SKIPPED', reason: 'penny_drop_off', vpa: normalized };
  }

  // Reuse recent successful verification (7 days)
  const existing = await query(
    `SELECT * FROM upi_beneficiary_verifications
     WHERE user_id = $1 AND lower(vpa) = $2
       AND status IN ('VERIFIED', 'SIMULATED')
       AND created_at > NOW() - INTERVAL '7 days'
     ORDER BY created_at DESC LIMIT 1`,
    [userId, normalized],
  ).catch(() => ({ rows: [] }));
  if (existing.rows[0]) {
    return {
      ok: true,
      status: existing.rows[0].status,
      beneficiaryName: existing.rows[0].beneficiary_name,
      verificationId: existing.rows[0].id,
      cached: true,
      vpa: normalized,
    };
  }

  let kycName = null;
  try {
    const kyc = await query(
      `SELECT full_name, legal_name, pan_name FROM user_profiles WHERE user_id = $1`,
      [userId],
    );
    kycName = kyc.rows[0]?.legal_name || kyc.rows[0]?.pan_name || kyc.rows[0]?.full_name || null;
  } catch { /* columns vary */ }

  const id = `upi_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  let status = 'SIMULATED';
  let beneficiaryName = declaredName || kycName || normalized.split('@')[0];
  let raw = { mode: 'simulate' };

  if (mode === 'live') {
    // Provider hook — Cashfree/Razorpay name enquiry when credentials exist
    try {
      const { tryLiveUpiNameEnquiry } = await import('./paymentProviders/upiNameEnquiry.mjs');
      const live = await tryLiveUpiNameEnquiry({ vpa: normalized, userId });
      if (live?.ok) {
        status = 'VERIFIED';
        beneficiaryName = live.name || beneficiaryName;
        raw = live.raw || live;
      } else {
        status = 'FAILED';
        raw = live || { error: 'provider_unavailable' };
      }
    } catch (err) {
      logger.warn('upi_live_enquiry_unavailable', { error: err.message });
      // Fall back to simulate so withdrawals aren't hard-blocked without PSP
      status = 'SIMULATED';
      raw = { mode: 'simulate_fallback', error: err.message };
    }
  }

  // Soft name consistency check when both sides present
  if (declaredName && kycName && status !== 'FAILED') {
    const a = normalizeNameForMatch(declaredName);
    const b = normalizeNameForMatch(kycName);
    if (a && b && a !== b && !a.includes(b) && !b.includes(a)) {
      status = 'FAILED';
      raw = { ...raw, reason: 'name_mismatch', declaredName, kycName };
    }
  }

  await query(
    `INSERT INTO upi_beneficiary_verifications (
       id, user_id, vpa, status, provider, beneficiary_name, amount_paise, reference_id, raw_response, verified_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb, CASE WHEN $4 IN ('VERIFIED','SIMULATED') THEN NOW() ELSE NULL END)
     ON CONFLICT DO NOTHING`,
    [
      id,
      userId,
      normalized,
      status,
      mode === 'live' ? 'psp' : 'internal',
      beneficiaryName,
      mode === 'simulate' ? 100 : 0,
      `ref_${id}`,
      JSON.stringify(raw),
    ],
  ).catch((err) => logger.warn('upi_verify_persist_failed', { error: err.message }));

  return {
    ok: status === 'VERIFIED' || status === 'SIMULATED',
    status,
    beneficiaryName,
    verificationId: id,
    vpa: normalized,
    reason: status === 'FAILED' ? (raw.reason || 'verification_failed') : null,
  };
}
