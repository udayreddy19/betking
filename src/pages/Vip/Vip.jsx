import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../utils/apiClient';
import { formatInr } from '../../utils/walletBalance';
import {
  LOYALTY_POINTS_PER_100_STANDARD,
  LOYALTY_POINTS_PER_100_SILVER,
  LOYALTY_POINTS_PER_100_GOLD,
  LOYALTY_POINTS_PER_100_VIP,
  getBenefitsForTier,
  VIP_TIER_POINTS,
  MIN_DEPOSIT_INR,
  MIN_WITHDRAW_INR,
} from '../../utils/vipBenefits';
import { getUserLoyaltyPoints, getUserVipPoints } from '../../utils/loyaltyPoints';
import {
  FiCrown,
  FiZap,
  FiGift,
  FiDollarSign,
  FiCheck,
  FiMinus,
  FiMessageSquare,
  FiStar,
  FiArrowRight,
  FiPhoneCall,
  FiAward,
  FiClock,
  FiTrendingUp,
} from '../../icons';
import './Vip.css';

export default function Vip() {
  const { user, isLoggedIn, openLoginModal, openDepositModal, showToast, refreshWallet } = useAuth();
  const [claimingCashback, setClaimingCashback] = useState(false);
  const [claimingMonthly, setClaimingMonthly] = useState(false);
  const [vipStatus, setVipStatus] = useState(null);

  const benefits = vipStatus || getBenefitsForTier(user?.loyaltyTier);
  const redeemablePoints = getUserLoyaltyPoints(user);
  const vipPoints = getUserVipPoints(user);
  const balance = user?.balance ?? 0;
  const vipRank = benefits.label || user?.loyaltyRank || 'Standard';

  useEffect(() => {
    if (!isLoggedIn) {
      setVipStatus(null);
      return undefined;
    }
    let cancelled = false;
    apiFetch('/api/v1/user/vip/status')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data?.vip) setVipStatus(data.vip);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isLoggedIn, user?.loyaltyPoints, user?.vipPoints]);

  const handleClaimCashback = async () => {
    if (!isLoggedIn) {
      openLoginModal();
      return;
    }
    if (claimingCashback) return;
    setClaimingCashback(true);
    try {
      const res = await apiFetch('/api/v1/user/vip/cashback', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not claim cashback.');
      await refreshWallet?.();
      showToast(`${formatInr(data.cashbackAmount)} cashback credited from yesterday’s net losses.`, 'success');
    } catch (err) {
      showToast(err.message || 'Could not claim cashback.', 'error');
    } finally {
      setClaimingCashback(false);
    }
  };

  const handleClaimMonthly = async () => {
    if (!isLoggedIn) {
      openLoginModal();
      return;
    }
    if (claimingMonthly) return;
    setClaimingMonthly(true);
    try {
      const res = await apiFetch('/api/v1/user/vip/monthly', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not claim club credit.');
      await refreshWallet?.();
      setVipStatus((prev) => (prev ? { ...prev, monthlyClaimed: true } : prev));
      const kind = data.rewardType === 'freebet' ? 'free bet' : data.rewardType === 'cash' ? 'cash' : 'bonus';
      showToast(`${formatInr(data.amount)} ${kind} credited for this month.`, 'success');
    } catch (err) {
      showToast(err.message || 'Could not claim club credit.', 'error');
    } finally {
      setClaimingMonthly(false);
    }
  };

  const vipBenefits = [
    {
      id: 'loyalty_boost',
      icon: <FiStar style={{ color: '#f59e0b', fontSize: '1.8rem' }} />,
      title: 'Tiered loyalty earn',
      subtitle: `Bronze ${LOYALTY_POINTS_PER_100_STANDARD} · Silver ${LOYALTY_POINTS_PER_100_SILVER} · Gold ${LOYALTY_POINTS_PER_100_GOLD} · Platinum/Diamond ${LOYALTY_POINTS_PER_100_VIP} per ₹100`,
      description: `Every cash, bonus, or free-bet stake earns loyalty and VIP points. Reach Silver at ${VIP_TIER_POINTS.SILVER.toLocaleString('en-IN')} VIP points (Pre-VIP). Gold ${VIP_TIER_POINTS.GOLD.toLocaleString('en-IN')}+, Platinum ${VIP_TIER_POINTS.PLATINUM.toLocaleString('en-IN')}+, Diamond ${VIP_TIER_POINTS.DIAMOND.toLocaleString('en-IN')}+. 5 points = ₹1 cash when you redeem.`,
      badge: 'LIVE',
    },
    {
      id: 'priority_transactions',
      icon: <FiZap style={{ color: '#f59e0b', fontSize: '1.8rem' }} />,
      title: 'Priority withdrawals',
      subtitle: `Min ₹${MIN_WITHDRAW_INR.toLocaleString('en-IN')} · faster review at higher tiers`,
      description: `Everyone has a ₹${MIN_WITHDRAW_INR.toLocaleString('en-IN')} minimum. VIP club jumps the finance queue. Review target: Silver 8h, Gold 4h, Platinum 2h, Diamond 1h. Max payout rises to ₹2.5L / ₹5L / ₹10L.`,
      badge: 'QUEUE',
    },
    {
      id: 'daily_cashback',
      icon: <FiDollarSign style={{ color: '#10b981', fontSize: '1.8rem' }} />,
      title: 'Daily cashback',
      subtitle: 'A share of yesterday’s net losses',
      description: 'Silver 2%, Gold 5%, Platinum 7.5%, Diamond 10% of net cash losses from the previous day, credited to your cash wallet. Claim once per day. Standard players have no cashback.',
      badge: 'CASH',
    },
    {
      id: 'better_cashout',
      icon: <FiClock style={{ color: '#0ea5e9', fontSize: '1.8rem' }} />,
      title: 'Better cashout',
      subtitle: 'Keep more when you settle early',
      description: 'Cashout is priced from live odds (fair value), then paid at 85% Standard / 88% Silver / 90% Gold / 92% Platinum / 95% Diamond. Live on cash bets in My Bets.',
      badge: 'LIVE',
    },
    {
      id: 'odds_boost',
      icon: <FiTrendingUp style={{ color: '#22c55e', fontSize: '1.8rem' }} />,
      title: 'VIP odds boost',
      subtitle: 'Gold+ cash bets land at better odds',
      description: 'Gold +2%, Platinum +3%, Diamond +5% on accepted cash odds. The boosted price is what we settle. Bonus and free-bet stakes are not boosted.',
      badge: 'GOLD+',
    },
    {
      id: 'monthly_credit',
      icon: <FiGift style={{ color: '#ec4899', fontSize: '1.8rem' }} />,
      title: 'Monthly club credit',
      subtitle: 'Claim once each calendar month',
      description: 'Silver ₹100 free bet, Gold ₹250 bonus, Platinum ₹500 bonus, Diamond ₹1,000 cash. Claim on this page. One-time tier-up gifts land automatically when you first reach each level.',
      badge: 'MONTHLY',
    },
    {
      id: 'priority_support',
      icon: <FiMessageSquare style={{ color: '#8b5cf6', fontSize: '1.8rem' }} />,
      title: 'Priority support',
      subtitle: 'Shorter first-response SLA',
      description: 'Standard 15 minutes. Silver 10, Gold 5, Platinum 3, Diamond 2. Gold+ tickets open HIGH. Platinum and Diamond are URGENT on the VIP desk.',
      badge: 'GOLD+',
    },
    {
      id: 'spin_boost',
      icon: <FiStar style={{ color: '#f59e0b', fontSize: '1.8rem' }} />,
      title: 'Bigger daily spin',
      subtitle: 'VIP multiplies the prize',
      description: 'Gold 1.25×, Platinum 1.5×, Diamond 2× the daily spin credit. Same wheel, higher payout at your tier.',
      badge: 'SPIN',
    },
    {
      id: 'gifting',
      icon: <FiCrown style={{ color: '#3b82f6', fontSize: '1.8rem' }} />,
      title: 'Loyalty redeem',
      subtitle: 'Turn points into withdrawable cash',
      description: 'From 50 points, redeem in the wallet menu. Credit goes to cash winnings. Same 5 points = ₹1 rate for every player — VIP simply earns points faster.',
      badge: 'REDEEM',
    },
  ];

  const comparisonData = [
    { feature: 'Loyalty points', all: `${LOYALTY_POINTS_PER_100_STANDARD} / ₹100`, preVip: `${LOYALTY_POINTS_PER_100_SILVER} / ₹100`, vip: `${LOYALTY_POINTS_PER_100_GOLD}–${LOYALTY_POINTS_PER_100_VIP} / ₹100` },
    { feature: 'Min deposit / withdraw', all: `₹${MIN_DEPOSIT_INR.toLocaleString('en-IN')}`, preVip: `₹${MIN_DEPOSIT_INR.toLocaleString('en-IN')}`, vip: `₹${MIN_DEPOSIT_INR.toLocaleString('en-IN')}` },
    { feature: 'Max withdrawal', all: '₹50,000', preVip: '₹1,00,000', vip: '₹2.5L – ₹10L' },
    { feature: 'Withdrawal review target', all: '24h', preVip: '8h', vip: '4h – 1h' },
    { feature: 'Cashout of potential', all: '85%', preVip: '88%', vip: '90–95%' },
    { feature: 'Odds boost', all: '—', preVip: '—', vip: '2–5%' },
    { feature: 'Daily cashback', all: '—', preVip: '2%', vip: '5–10%' },
    { feature: 'Monthly club credit', all: '—', preVip: '₹100 free bet', vip: '₹250 – ₹1,000' },
    { feature: 'Daily spin multiplier', all: '1×', preVip: '1×', vip: '1.25–2×' },
    { feature: 'Support first reply', all: '15 min', preVip: '10 min', vip: '5–2 min' },
    { feature: 'Dedicated manager review', all: false, preVip: false, vip: true },
  ];

  const cellValue = (value) => {
    if (value === true) return <span className="vip-check vip-check--gold"><FiCheck /></span>;
    if (value === false || value === '—') return <span className="vip-cross"><FiMinus /></span>;
    return <span className="vip-cell-text">{value}</span>;
  };

  const testimonials = [
    {
      name: 'Vikram S. (Mumbai)',
      role: 'VIP Diamond Member',
      quote: 'Priority withdrawals and Diamond cashout at 95% make a real difference on live cricket.',
      stars: 5,
    },
    {
      name: 'Ananya P. (Bengaluru)',
      role: 'VIP Gold Member',
      quote: 'Gold odds boost plus daily cashback and the monthly bonus actually credit. You feel the club benefits on every bet.',
      stars: 5,
    },
    {
      name: 'Rohan V. (Delhi)',
      role: 'VIP Platinum Member',
      quote: 'Platinum support replies faster and the 1.5× daily spin is a nice extra on top of 7.5% cashback.',
      stars: 5,
    },
  ];

  return (
    <div className="vip-page">
      <div className="vip-container">
        {/* User Balance & Status Bar */}
        <motion.div
          className="vip-user-bar"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="vip-user-bar__left">
            <div className="vip-user-stat">
              <span className="vip-user-stat__label">👑 VIP Tier</span>
              <span className="vip-user-stat__value vip-user-stat__value--tier">{vipRank}</span>
            </div>
            <div className="vip-user-stat">
              <span className="vip-user-stat__label">🏆 VIP points</span>
              <span className="vip-user-stat__value">{vipPoints}</span>
            </div>
            <div className="vip-user-stat">
              <span className="vip-user-stat__label">⭐ Redeemable</span>
              <span className="vip-user-stat__value">{redeemablePoints}</span>
            </div>
            <div className="vip-user-stat">
              <span className="vip-user-stat__label">Earn rate</span>
              <span className="vip-user-stat__value">{benefits.pointsPer100} / ₹100</span>
            </div>
            <div className="vip-user-stat">
              <span className="vip-user-stat__label">Cashout</span>
              <span className="vip-user-stat__value">{Math.round((benefits.cashoutPayoutPct || 0.85) * 100)}%</span>
            </div>
            <div className="vip-user-stat">
              <span className="vip-user-stat__label">Odds boost</span>
              <span className="vip-user-stat__value">{benefits.oddsBoostPct ? `+${benefits.oddsBoostPct}%` : '—'}</span>
            </div>
            <div className="vip-user-stat">
              <span className="vip-user-stat__label">💰 Cash Balance</span>
              <span className="vip-user-stat__value">{formatInr(balance)}</span>
            </div>
          </div>
          <button
            type="button"
            className="vip-deposit-btn"
            onClick={openDepositModal}
          >
            + Deposit Funds
          </button>
        </motion.div>

        {/* Hero Banner */}
        <motion.div
          className="vip-hero"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
        >
          <div className="vip-hero__content">
            <div className="vip-hero__tag">
              <FiCrown /> EXCLUSIVE CLUB EXPERIENCE
            </div>
            <h1>VIP Benefits at OddsYra</h1>
            <p className="vip-hero__subtitle">
              Standard (Bronze) players earn {LOYALTY_POINTS_PER_100_STANDARD} points per ₹100 staked.
              Silver earns {LOYALTY_POINTS_PER_100_SILVER}, Gold {LOYALTY_POINTS_PER_100_GOLD}, and Platinum/Diamond {LOYALTY_POINTS_PER_100_VIP}.
              Plus cashback, better cashout, and monthly club credit from Silver upward.
              Min deposit and withdrawal is ₹{MIN_DEPOSIT_INR.toLocaleString('en-IN')}.
            </p>
            <div className="vip-hero__actions">
              <button
                type="button"
                className="vip-btn-primary"
                onClick={handleClaimCashback}
                disabled={claimingCashback || !benefits.cashbackPct}
              >
                <FiDollarSign /> {claimingCashback ? 'Claiming…' : benefits.cashbackPct ? 'Claim yesterday’s cashback' : 'Cashback from Silver'}
              </button>
              <a href="#comparison" className="vip-btn-outline">
                Compare Tiers <FiArrowRight />
              </a>
            </div>
          </div>
        </motion.div>

        {/* Core VIP Benefits Section */}
        <section className="vip-section">
          <div className="vip-section__header">
            <span className="vip-section__badge">VIP ADVANTAGES</span>
            <h2>What VIP actually unlocks</h2>
            <p>Faster points, higher withdrawal limits, daily cashback, and priority support — all live on sports bets.</p>
          </div>

          <div className="vip-benefits-grid">
            {vipBenefits.map((item, idx) => (
              <motion.div
                key={item.id}
                className="vip-benefit-card"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.08 }}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
              >
                <div className="vip-benefit-card__top">
                  <div className="vip-benefit-card__icon">{item.icon}</div>
                  <span className="vip-benefit-card__badge">{item.badge}</span>
                </div>
                <h3>{item.title}</h3>
                <h4 className="vip-benefit-card__sub">{item.subtitle}</h4>
                <p>{item.description}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Everyday Offers Spotlight */}
        <motion.div
          className="vip-spotlight-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="vip-spotlight__badge">DAILY CASHBACK</div>
          <h2>A cut of yesterday’s net losses</h2>
          <p>
            VIP club members can claim cashback once a day. It is {benefits.cashbackPct || 2}–10% of net cash losses
            from the previous day, paid to your cash wallet. Standard accounts earn points only.
          </p>
          {isLoggedIn && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
              <button
                type="button"
                className="vip-btn-primary"
                onClick={handleClaimCashback}
                disabled={claimingCashback || !benefits.cashbackPct}
              >
                {claimingCashback ? 'Claiming…' : 'Claim cashback'}
              </button>
              <button
                type="button"
                className="vip-btn-outline"
                onClick={handleClaimMonthly}
                disabled={claimingMonthly || !benefits.monthlyReward?.amount || benefits.monthlyClaimed}
              >
                {claimingMonthly
                  ? 'Claiming…'
                  : benefits.monthlyClaimed
                    ? 'Monthly credit claimed'
                    : benefits.monthlyReward?.amount
                      ? `Claim ${formatInr(benefits.monthlyReward.amount)} ${benefits.monthlyReward.type}`
                      : 'Monthly credit from Silver'}
              </button>
            </div>
          )}
        </motion.div>

        {/* How to Become a VIP Section */}
        <section className="vip-section vip-how-section">
          <div className="vip-card-box">
            <div className="vip-card-box__icon">
              <FiPhoneCall />
            </div>
            <div className="vip-card-box__content">
              <h2>How to join the VIP club</h2>
              <p>
                Place sports bets. Bronze accounts earn {LOYALTY_POINTS_PER_100_STANDARD} points per ₹100.
                At {VIP_TIER_POINTS.SILVER.toLocaleString('en-IN')} VIP points you reach Silver (Pre-VIP) and earn {LOYALTY_POINTS_PER_100_SILVER} per ₹100.
                Gold starts at {VIP_TIER_POINTS.GOLD.toLocaleString('en-IN')} ({LOYALTY_POINTS_PER_100_GOLD}/₹100),
                Platinum at {VIP_TIER_POINTS.PLATINUM.toLocaleString('en-IN')} ({LOYALTY_POINTS_PER_100_VIP}/₹100),
                Diamond at {VIP_TIER_POINTS.DIAMOND.toLocaleString('en-IN')} ({LOYALTY_POINTS_PER_100_VIP}/₹100).
                Redeeming loyalty points for cash does not reduce your VIP tier.
              </p>
              <div className="vip-how-steps mt-4">
                <div className="vip-step-item">
                  <span className="vip-step-num">1</span>
                  <div>
                    <strong>Bet on sports</strong>
                    <p>Every stake earns loyalty points at your current tier rate.</p>
                  </div>
                </div>
                <div className="vip-step-item">
                  <span className="vip-step-num">2</span>
                  <div>
                    <strong>Hit Silver ({VIP_TIER_POINTS.SILVER.toLocaleString('en-IN')} VIP pts)</strong>
                    <p>Unlock {LOYALTY_POINTS_PER_100_SILVER} pts / ₹100, 2% daily cashback, and ₹1L max withdrawal.</p>
                  </div>
                </div>
                <div className="vip-step-item">
                  <span className="vip-step-num">3</span>
                  <div>
                    <strong>Climb Gold+</strong>
                    <p>Higher cashback, bigger withdrawal caps, and HIGH-priority support tickets.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Tier Comparison Table */}
        <section className="vip-section" id="comparison">
          <div className="vip-section__header">
            <span className="vip-section__badge">BENEFIT MATRIX</span>
            <h2>All Players vs Pre-VIP Players vs VIP Players</h2>
            <p>See how your VIP membership unlocks unmatched advantages at every level</p>
          </div>

          <div className="vip-table-wrap">
            <table className="vip-table">
              <thead>
                <tr>
                  <th>VIP Feature / Benefit</th>
                  <th>All Players</th>
                  <th>Pre-VIP Players</th>
                  <th className="vip-col-highlight">👑 VIP Players</th>
                </tr>
              </thead>
              <tbody>
                {comparisonData.map((row, idx) => (
                  <tr key={idx}>
                    <td className="vip-feature-name">
                      <strong>{row.feature}</strong>
                    </td>
                    <td>{cellValue(row.all)}</td>
                    <td>{cellValue(row.preVip)}</td>
                    <td className="vip-col-highlight">{cellValue(row.vip)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Testimonials ("Hear why our VIP players love it") */}
        <section className="vip-section">
          <div className="vip-section__header">
            <span className="vip-section__badge">MEMBER TESTIMONIALS</span>
            <h2>Hear Why Our VIP Players Love It</h2>
            <p>Real feedback from active OddsYra VIP Club members</p>
          </div>

          <div className="vip-testimonials-grid">
            {testimonials.map((t, idx) => (
              <div key={idx} className="vip-testimonial-card">
                <div className="vip-testimonial-stars">
                  {[...Array(t.stars)].map((_, i) => (
                    <FiStar key={i} className="star-icon" />
                  ))}
                </div>
                <p className="vip-testimonial-quote">"{t.quote}"</p>
                <div className="vip-testimonial-user">
                  <strong>{t.name}</strong>
                  <span>{t.role}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Loyalty Club Banner */}
        <div className="vip-loyalty-banner">
          <div className="vip-loyalty-banner__inner">
            <div>
              <h2>👑 OddsYra Loyalty Club</h2>
              <p>Play more, earn more: unlock bigger rewards, freebets, and cash prizes!</p>
            </div>
            <Link to="/profile" className="vip-btn-gold">
              Redeem points <FiAward />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
