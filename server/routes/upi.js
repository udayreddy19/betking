import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { requireAuth, writeAudit } from '../middleware/auth.js';
import { upiLimiter } from '../middleware/rateLimit.js';
import { creditWallet } from '../services/ledger.js';
import { normalizeUtr, verifyUtrAgainstRazorpay } from '../services/upiVerify.js';
import { isGatewayEnabled } from '../services/paymentGateways.js';
import { mailUpiClaimStatus, mailDepositCompleted } from '../services/mail.js';
import { assertFeatureEnabled } from '../services/siteSettings.js';
import { assertWalletNotPaused } from '../services/userPreferences.js';
import {
  assertMoneyRiskChecks,
  assertWithinLimits,
  deviceHashFromRequest,
  recordVelocityEvent,
} from '../services/velocity.js';
import { calcFeeBreakdown, calcUpiUserCharges } from '../services/depositCategories.js';

const router = Router();

export const UPI_PAY_URL = process.env.UPI_RAZORPAY_ME_URL || 'https://razorpay.me/@WalletsUPI';
const QR_IMAGE_URL = process.env.RAZORPAY_COLLECT_QR_URL || '/qr/razorpay-collect.jpeg';
const MAX_RECEIPT_CHARS = 7_000_000; // ~5MB binary as base64

async function upiBounds() {
  const { getUpiLimits } = await import('../services/siteSettings.js');
  return getUpiLimits();
}

async function upiFeeForAmount(grossInr) {
  const { getUpiLimits, getUpiMdrPolicy } = await import('../services/siteSettings.js');
  const [bounds, mdr] = await Promise.all([getUpiLimits(), getUpiMdrPolicy()]);
  const charges = calcUpiUserCharges(grossInr, bounds.feePct, mdr);
  return { bounds, mdr, charges };
}

function feeBreakdown(grossInr, feePct) {
  const base = calcFeeBreakdown(grossInr, feePct);
  return {
    ...base,
    feePct: base.ratePct,
  };
}

router.get('/config', requireAuth, async (_req, res) => {
  const razorpayEnabled = await isGatewayEnabled('RAZORPAY');
  const payProvider = razorpayEnabled ? 'RAZORPAY' : null;
  const bounds = await upiBounds();
  const feePct = bounds.feePct;
  const { getUpiMdrPolicy } = await import('../services/siteSettings.js');
  const upiMdr = await getUpiMdrPolicy();
  const note = upiMdr.enabled
    ? `A ${feePct}% platform fee plus UPI network MDR (${upiMdr.ratePct}% above ₹${upiMdr.freeUnderInr}, max ₹${upiMdr.capInr}) is deducted before wallet credit.`
    : `A ${feePct}% fee is deducted from the paid amount before wallet credit.`;
  res.json({
    payUrl: UPI_PAY_URL,
    razorpayPayUrl: UPI_PAY_URL,
    payProvider,
    qrImageUrl: QR_IMAGE_URL,
    minAmountInr: bounds.minInr,
    maxAmountInr: bounds.maxInr,
    razorpayEnabled,
    upiAvailable: Boolean(payProvider),
    feePct,
    rates: {
      domesticRupayPct: feePct,
      razorpayQrPct: feePct,
      note,
    },
    upiMdr: {
      enabled: upiMdr.enabled,
      ratePct: upiMdr.ratePct,
      freeUnderInr: upiMdr.freeUnderInr,
      capFromInr: upiMdr.capFromInr,
      capInr: upiMdr.capInr,
    },
  });
});

router.get('/mine', requireAuth, async (req, res) => {
  try {
    const channel = String(req.query.channel || '').trim();
    const { rows } = await query(
      `SELECT id, customer_name, mobile, email, amount_paise, utr, status, channel, fee_paise,
              failure_reason, credited_paise, provider_payment_id, created_at, updated_at
       FROM upi_payment_claims
       WHERE user_id = $1
         AND ($2::text = '' OR channel = $2)
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.user.id, channel],
    );
    res.json({
      claims: rows.map((r) => ({
        id: r.id,
        customerName: r.customer_name,
        mobile: r.mobile,
        email: r.email,
        amountPaise: Number(r.amount_paise),
        feePaise: Number(r.fee_paise || 0),
        utr: r.utr,
        status: r.status,
        channel: r.channel || 'rupay_upi',
        failureReason: r.failure_reason,
        creditedPaise: r.credited_paise != null ? Number(r.credited_paise) : null,
        providerPaymentId: r.provider_payment_id,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    });
  } catch (err) {
    console.error('[upi/mine]', err);
    res.status(500).json({ error: 'Failed to load claims' });
  }
});

/**
 * Submit payment details AFTER paying (razorpay.me or static QR).
 * UTR verification + wallet credit happen only on this submit.
 */
router.post('/claims', requireAuth, upiLimiter, async (req, res) => {
  try {
    const channelRaw = String(req.body?.channel || '').trim().toLowerCase();
    let channel = 'rupay_upi';
    if (channelRaw === 'razorpay_qr') channel = 'razorpay_qr';

    try {
      await assertFeatureEnabled(channel === 'razorpay_qr' ? 'qr' : 'upi');
      await assertWalletNotPaused(req.user.id);
    } catch (gateErr) {
      return res.status(gateErr.status || 503).json({ error: gateErr.message, code: gateErr.code });
    }

    const razorpayEnabled = await isGatewayEnabled('RAZORPAY');

    // Legacy cashfree_upi claims map to RuPay UPI (Razorpay) verification
    if (channelRaw === 'cashfree_upi') channel = 'rupay_upi';

    if (channel === 'razorpay_qr' && !razorpayEnabled) {
      return res.status(503).json({
        error: 'Razorpay is disabled by admin. QR collect is unavailable.',
        code: 'RAZORPAY_DISABLED',
      });
    }
    if (channel === 'rupay_upi' && !razorpayEnabled) {
      return res.status(503).json({
        error: 'Razorpay is disabled by admin. UPI verification is unavailable.',
        code: 'RAZORPAY_DISABLED',
      });
    }

    const bounds = await upiBounds();
    const feePct = bounds.feePct;

    const customerName = String(req.body?.customerName || '').trim().slice(0, 120);
    const mobile = String(req.body?.mobile || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase().slice(0, 180);
    const amountInr = Number(req.body?.amountInr);
    const utr = normalizeUtr(req.body?.utr);
    const receiptMime = String(req.body?.receiptMime || '').slice(0, 80) || null;
    const receiptData = req.body?.receiptData ? String(req.body.receiptData) : null;

    if (!customerName) return res.status(400).json({ error: 'Customer name is required' });
    if (!/^\d{10}$/.test(mobile)) return res.status(400).json({ error: 'Enter a valid 10-digit mobile number' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email' });
    if (!Number.isFinite(amountInr) || amountInr < bounds.minInr || amountInr > bounds.maxInr) {
      return res.status(400).json({
        error: `Amount must be ₹${bounds.minInr} – ₹${bounds.maxInr.toLocaleString('en-IN')}`,
      });
    }
    const amountPaiseCheck = Math.round(amountInr * 100);
    if (!utr || utr.length < 6 || utr.length > 64) {
      return res.status(400).json({ error: 'Enter a valid UTR / bank reference' });
    }
    if (channel === 'razorpay_qr' && !receiptData) {
      return res.status(400).json({
        error: 'Payment screenshot is required for QR collect',
      });
    }
    if (receiptData && receiptData.length > MAX_RECEIPT_CHARS) {
      return res.status(400).json({ error: 'Receipt image must be under 5 MB' });
    }
    if (receiptData && receiptMime && !/^image\/(jpeg|jpg|png|gif|webp)$/i.test(receiptMime)) {
      return res.status(400).json({ error: 'Receipt must be JPG, PNG, GIF or WebP' });
    }

    const { charges: fee, mdr: mdrPolicy } = await upiFeeForAmount(amountInr);
    const amountPaise = fee.grossPaise;
    const creditPaise = fee.creditedPaise;
    const feePaise = fee.chargesPaise;
    const platformFeePaise = fee.platformFeePaise;
    const mdrPaise = fee.mdrPaise;

    let claimId = null;
    try {
      claimId = await withTransaction(async (client) => {
        await assertWithinLimits(req.user.id, { kind: 'deposit', amountPaise: amountPaiseCheck }, client);
        const deviceHash = deviceHashFromRequest(req);
        await assertMoneyRiskChecks(
          req.user.id,
          { kind: 'deposit', ip: req.ip, deviceHash },
          client,
        );

        const dup = await client.query(
          `SELECT id, status, user_id FROM upi_payment_claims WHERE UPPER(utr) = $1 LIMIT 1`,
          [utr],
        );
        if (dup.rows[0]) {
          if (dup.rows[0].status === 'success') {
            throw Object.assign(new Error('This UTR was already verified and credited.'), {
              status: 409,
              code: 'UTR_ALREADY_USED',
              claimId: dup.rows[0].id,
              claimStatus: dup.rows[0].status,
            });
          }
          if (String(dup.rows[0].user_id) !== String(req.user.id)) {
            throw Object.assign(new Error('This UTR was already submitted by another account.'), {
              status: 409,
              code: 'UTR_ALREADY_USED',
              claimId: dup.rows[0].id,
              claimStatus: dup.rows[0].status,
            });
          }
          const existingId = dup.rows[0].id;
          await client.query(
            `UPDATE upi_payment_claims
             SET customer_name = $2, mobile = $3, email = $4, amount_paise = $5,
                 channel = $6, fee_paise = $7,
                 receipt_mime = COALESCE($8, receipt_mime),
                 receipt_data = COALESCE($9, receipt_data),
                 status = 'pending', failure_reason = NULL, updated_at = NOW()
             WHERE id = $1`,
            [existingId, customerName, mobile, email, amountPaise, channel, feePaise, receiptMime, receiptData],
          );
          await recordVelocityEvent(client, {
            userId: req.user.id,
            kind: 'deposit',
            ip: req.ip,
            deviceHash,
            amountPaise,
          });
          return existingId;
        }

        const { rows: inserted } = await client.query(
          `INSERT INTO upi_payment_claims
             (user_id, customer_name, mobile, email, amount_paise, utr, receipt_mime, receipt_data, status, channel, fee_paise)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,$10)
           RETURNING id`,
          [req.user.id, customerName, mobile, email, amountPaise, utr, receiptMime, receiptData, channel, feePaise],
        );
        await recordVelocityEvent(client, {
          userId: req.user.id,
          kind: 'deposit',
          ip: req.ip,
          deviceHash,
          amountPaise,
        });
        return inserted[0].id;
      });
    } catch (err) {
      if (err.code === 'UTR_ALREADY_USED') {
        return res.status(409).json({
          error: err.message,
          code: err.code,
          claimId: err.claimId,
          status: err.claimStatus,
        });
      }
      if (
        err.code === 'DAILY_DEPOSIT_LIMIT'
        || err.code === 'WEEKLY_DEPOSIT_LIMIT'
        || err.code === 'IP_VELOCITY'
        || err.code === 'IP_ACCOUNT_VELOCITY'
        || err.code === 'DEVICE_VELOCITY'
      ) {
        return res.status(err.status || 429).json({ error: err.message, code: err.code });
      }
      throw err;
    }

    let verify;
    {
      try {
        verify = await verifyUtrAgainstRazorpay({ utr, amountPaise });
      } catch (err) {
        console.error('[upi/verify]', err);
        verify = {
          matched: false,
          status: 'manual_review',
          reason: 'Could not reach Razorpay to verify. Claim saved for review.',
          payment: null,
        };
      }
    }

    if (verify.status === 'success' && verify.payment) {
      const paymentId = verify.payment.id;
      try {
        const credit = await withTransaction(async (client) => {
          const result = await creditWallet(client, {
            userId: req.user.id,
            amountPaise: creditPaise,
            entryType: 'deposit_credit',
            referenceType: 'upi_claim',
            referenceId: claimId,
            idempotencyKey: `upi:${utr}`,
            metadata: {
              channel,
              utr,
              razorpayPaymentId: paymentId,
              customerName,
              mobile,
              email,
              grossPaise: amountPaise,
              feePaise,
              platformFeePaise,
              mdrPaise,
              feePct,
              mdrEnabled: mdrPolicy.enabled,
            },
          });
          await client.query(
            `UPDATE upi_payment_claims
             SET status = 'success',
                 provider_payment_id = $2,
                 credited_paise = $3,
                 fee_paise = $4,
                 verify_detail = $5::jsonb,
                 failure_reason = NULL,
                 updated_at = NOW()
             WHERE id = $1`,
            [
              claimId,
              paymentId,
              creditPaise,
              feePaise,
              JSON.stringify({
                reason: verify.reason,
                paymentStatus: verify.payment.status,
                method: verify.payment.method,
                feePct,
                platformFeePaise,
                mdrPaise,
                mdrEnabled: mdrPolicy.enabled,
                chargesInr: fee.charges,
                acquirer: verify.payment.acquirer_data || {},
              }),
            ],
          );
          return result;
        });

        await writeAudit(
          req.user.id,
          'upi.claim.success',
          'upi_claim',
          claimId,
          { utr, amountPaise, creditPaise, feePaise, channel, paymentId },
          req.ip,
        );
        mailDepositCompleted({
          userId: req.user.id,
          email: req.user.email,
          name: req.user.fullName || req.user.full_name,
          amount: amountPaise,
          creditedAmount: creditPaise,
          depositId: claimId,
          paymentId,
          provider: 'razorpay',
          utr,
          method: channel,
        }).catch(() => {});
        const feeMsg = mdrPaise > 0
          ? `platform fee ₹${fee.platformFee.toLocaleString('en-IN')} + network MDR ₹${fee.mdr.toLocaleString('en-IN')}`
          : `${feePct}% fee`;
        return res.json({
          ok: true,
          status: 'success',
          claimId,
          creditedPaise: creditPaise,
          feePaise,
          platformFeePaise,
          mdrPaise,
          feePct,
          balanceAfterPaise: credit.balanceAfter,
          message: `Payment verified. ₹${fee.credited.toLocaleString('en-IN')} credited after ${feeMsg}.`,
        });
      } catch (err) {
        console.error('[upi/credit]', err);
        await query(
          `UPDATE upi_payment_claims
           SET status = 'manual_review',
               provider_payment_id = $2,
               verify_detail = $3::jsonb,
               failure_reason = $4,
               updated_at = NOW()
           WHERE id = $1`,
          [
            claimId,
            paymentId,
            JSON.stringify({ reason: verify.reason, creditError: err.message }),
            err.message,
          ],
        );
        return res.status(500).json({
          ok: false,
          status: 'manual_review',
          claimId,
          error: 'Payment matched but wallet credit failed. Support will review.',
        });
      }
    }

    const finalStatus = verify.status === 'manual_review' ? 'manual_review' : 'failed';
    await query(
      `UPDATE upi_payment_claims
       SET status = $2,
           provider_payment_id = $3,
           verify_detail = $4::jsonb,
           failure_reason = $5,
           updated_at = NOW()
       WHERE id = $1`,
      [
        claimId,
        finalStatus,
        verify.payment?.id || null,
        JSON.stringify({
          reason: verify.reason,
          scannedCount: verify.scannedCount,
          paymentStatus: verify.payment?.status,
        }),
        verify.reason,
      ],
    );

    await writeAudit(
      req.user.id,
      `upi.claim.${finalStatus}`,
      'upi_claim',
      claimId,
      { utr, amountPaise, channel, reason: verify.reason },
      req.ip,
    );

    mailUpiClaimStatus({
      email: req.user.email,
      name: req.user.fullName || req.user.full_name,
      amount: amountPaise,
      creditedAmount: creditPaise,
      status: finalStatus,
      utr,
      channel,
    }).catch(() => {});

    return res.status(finalStatus === 'failed' ? 422 : 202).json({
      ok: false,
      status: finalStatus,
      claimId,
      error: verify.reason,
      message: finalStatus === 'failed'
        ? 'Transaction could not be verified as successful.'
        : 'Saved for manual review.',
    });
  } catch (err) {
    console.error('[upi/claims]', err);
    if (String(err.message || '').includes('idx_upi_claims_utr')) {
      return res.status(409).json({ error: 'This UTR was already submitted.' });
    }
    res.status(500).json({ error: 'Failed to submit payment details' });
  }
});

export { feeBreakdown, QR_IMAGE_URL, upiBounds };
export default router;
