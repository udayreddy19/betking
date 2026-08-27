import { Router } from 'express';
import { requireAuth } from '../middleware/userAuth.js';
import { rewardsClaimRateLimiter } from '../middleware/rateLimiter.js';
import { claimDailySpin, getDailySpinStatus } from '../../lib/dailySpinEngine.mjs';
import { redeemLoyaltyPoints } from '../../lib/loyaltyEngine.mjs';

const router = Router();

router.get('/daily-spin', requireAuth, async (req, res) => {
  try {
    const status = await getDailySpinStatus(req.user.userId);
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, code: 'SPIN_STATUS_FAILED' });
  }
});

router.post('/daily-spin', requireAuth, async (req, res) => {
  try {
    const result = await claimDailySpin(req.user.userId);
    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      error: err.message,
      code: err.code || 'SPIN_FAILED',
    });
  }
});

router.post('/loyalty/redeem', requireAuth, async (req, res) => {
  try {
    const result = await redeemLoyaltyPoints(req.user.userId, req.body?.points);
    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      error: err.message,
      code: err.code || 'LOYALTY_REDEEM_FAILED',
    });
  }
});

router.post('/promo/claim', requireAuth, rewardsClaimRateLimiter, async (req, res) => {
  try {
    const { claimSignupPromo } = await import('../../lib/signupPromoCodes.mjs');
    const result = await claimSignupPromo(req.user.userId, req.body?.code || req.body?.promoCode);
    res.json({ success: true, ...result });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      error: err.message,
      code: err.code || 'PROMO_CLAIM_FAILED',
      claimedCode: err.claimedCode,
    });
  }
});

router.get('/promo/claims', requireAuth, async (req, res) => {
  try {
    const { listUserSignupPromoClaims } = await import('../../lib/signupPromoCodes.mjs');
    const claims = await listUserSignupPromoClaims(req.user.userId);
    res.json({ success: true, claims });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
      code: 'PROMO_CLAIMS_FAILED',
    });
  }
});

router.get('/referrals/me', requireAuth, async (req, res) => {
  try {
    const { getMyReferralDashboard } = await import('../../lib/referralLoyaltyEngine.mjs');
    const data = await getMyReferralDashboard(req.user.userId);
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, code: 'REFERRAL_DASHBOARD_FAILED' });
  }
});

router.get('/deposit-freebet/me', requireAuth, async (req, res) => {
  try {
    const {
      listMyDepositFreebetGrants,
      getDepositFreebetCampaign,
    } = await import('../../lib/depositFreebetEngine.mjs');
    const [grants, campaign] = await Promise.all([
      listMyDepositFreebetGrants(req.user.userId),
      getDepositFreebetCampaign(),
    ]);
    res.json({
      success: true,
      grants,
      campaign: campaign
        ? {
            name: campaign.name,
            enabled: campaign.enabled,
            minDeposit: campaign.minDeposit,
            matchPercent: campaign.matchPercent,
            maxFreeBet: campaign.maxFreeBet,
            freebetExpiryDays: campaign.freebetExpiryDays,
          }
        : null,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, code: 'DEPOSIT_FREEBET_LIST_FAILED' });
  }
});

router.post('/referrals/validate', async (req, res) => {
  try {
    const { validateReferralCode } = await import('../../lib/referralLoyaltyEngine.mjs');
    const result = await validateReferralCode(req.body?.code || req.body?.referralCode || req.query?.ref);
    res.status(result.valid ? 200 : 400).json({ success: result.valid, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message, code: err.code || 'REFERRAL_INVALID' });
  }
});

export default router;
