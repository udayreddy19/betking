import { useState } from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../utils/apiClient';
import { formatInr } from '../../utils/walletBalance';
import {
  FiCrown,
  FiZap,
  FiUserCheck,
  FiGift,
  FiDollarSign,
  FiCalendar,
  FiCheck,
  FiMinus,
  FiMessageSquare,
  FiStar,
  FiShield,
  FiArrowRight,
  FiPhoneCall,
  FiAward,
} from '../../icons';
import './Vip.css';

export default function Vip() {
  const { user, isLoggedIn, openLoginModal, openDepositModal, showToast } = useAuth();
  const [requestedTrial, setRequestedTrial] = useState(false);
  const [requestingTrial, setRequestingTrial] = useState(false);

  const coins = user?.coins ?? user?.loyaltyPoints ?? 0;
  const balance = user?.balance ?? 0;
  const vipRank = user?.loyaltyRank || 'Pre-VIP';

  const handleRequestVipTrial = async () => {
    if (!isLoggedIn) {
      openLoginModal();
      return;
    }
    if (requestingTrial || requestedTrial) return;
    setRequestingTrial(true);
    try {
      const res = await apiFetch('/api/v1/support/tickets', {
        method: 'POST',
        body: JSON.stringify({
          subject: 'VIP trial request',
          category: 'VIP',
          initialMessage: `${user?.email || user?.userId} requested the VIP trial program.`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 409) {
        throw new Error(data.error || 'Could not submit VIP request.');
      }
      const ticket = data.ticket || data.conversation || data.activeTicket || {};
      const ticketNumber = ticket.ticketNumber || ticket.conversationNumber || ticket.conversationId || data.ticketNumber;
      setRequestedTrial(true);
      showToast(
        ticketNumber
          ? `VIP request opened as ticket ${ticketNumber}.`
          : 'VIP request submitted. Our team will review it.',
        'success',
      );
    } catch (err) {
      showToast(err.message || 'Could not submit VIP request.', 'error');
    } finally {
      setRequestingTrial(false);
    }
  };

  const vipBenefits = [
    {
      id: 'priority_transactions',
      icon: <FiZap style={{ color: '#f59e0b', fontSize: '1.8rem' }} />,
      title: 'Priority Transaction Services',
      subtitle: 'Quicker Deposits & Express Withdrawals',
      description: 'Enjoy zero-delay deposit processing and priority express withdrawal queues handled directly by senior finance officers.',
      badge: 'SPEED',
    },
    {
      id: 'dedicated_manager',
      icon: <FiUserCheck style={{ color: '#8b5cf6', fontSize: '1.8rem' }} />,
      title: 'Dedicated Account Managers',
      subtitle: 'Personalized Assistance & Exclusive WhatsApp Line',
      description: 'A dedicated Account Manager provides 24/7 1-on-1 assistance via a private direct WhatsApp communication channel.',
      badge: '24/7 DIRECT',
    },
    {
      id: 'tailored_offers',
      icon: <FiCrown style={{ color: '#ec4899', fontSize: '1.8rem' }} />,
      title: 'Tailored Exclusive Offers',
      subtitle: 'Customized Deals to Elevate Your Betting',
      description: 'Bespoke reload bonuses, enhanced odds multipliers, and tailored promotions designed specifically for your favourite sports & games.',
      badge: 'CUSTOM',
    },
    {
      id: 'daily_cashback',
      icon: <FiDollarSign style={{ color: '#10b981', fontSize: '1.8rem' }} />,
      title: 'Daily Cashback (EVERY DAY)',
      subtitle: 'Personalized to Your Game Preference',
      description: 'Receive real money daily cashback credited automatically based on your gameplay across Sportsbook, Live Casino, and Slots.',
      badge: 'DAILY CASH',
    },
    {
      id: 'gifting',
      icon: <FiGift style={{ color: '#3b82f6', fontSize: '1.8rem' }} />,
      title: 'Luxury Gifting',
      subtitle: 'Tailormade Physical & Digital Gifts',
      description: 'Receive exclusive tech gadgets, luxury gift hampers, event tickets, and tailormade rewards matching your personal preferences.',
      badge: 'LUXURY',
    },
    {
      id: 'birthday_gift',
      icon: <FiCalendar style={{ color: '#f43f5e', fontSize: '1.8rem' }} />,
      title: 'Birthday Gift',
      subtitle: 'VIP Bonus & Cash to Celebrate Your Day',
      description: 'Celebrate your special day with a customized high-value VIP birthday gift, cash bonus, and free spins packages.',
      badge: 'ANNUAL BONUS',
    },
  ];

  const comparisonData = [
    { feature: 'Priority Transactions', all: false, preVip: true, vip: true },
    { feature: 'Dedicated Account Manager', all: false, preVip: false, vip: true },
    { feature: 'Tailored Exclusive Offers', all: false, preVip: false, vip: true },
    { feature: 'Daily Cashback', all: false, preVip: true, vip: true },
    { feature: 'Special Loyalty Bonus', all: false, preVip: true, vip: true },
    { feature: 'Luxury Gifting', all: false, preVip: false, vip: true },
    { feature: 'Birthday Gift', all: false, preVip: false, vip: true },
  ];

  const testimonials = [
    {
      name: 'Vikram S. (Mumbai)',
      role: 'VIP Diamond Member',
      quote: 'The instant priority withdrawals and having a dedicated WhatsApp VIP manager make OddsYra unbeatable. Requests get handled in under 2 minutes!',
      stars: 5,
    },
    {
      name: 'Ananya P. (Bengaluru)',
      role: 'VIP Gold Member',
      quote: 'The daily cashbacks and personalized birthday bonuses are truly high value. You really feel treated like royalty here.',
      stars: 5,
    },
    {
      name: 'Rohan V. (Delhi)',
      role: 'VIP Platinum Member',
      quote: 'Tailored exclusive odds on IPL and cricket matches along with express payouts. Best VIP program in India hands down.',
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
              <span className="vip-user-stat__label">🪙 Coins</span>
              <span className="vip-user-stat__value">{coins}</span>
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
              Unrivaled VIP experience · Excellent service and exclusive personalized benefits created for you
            </p>
            <div className="vip-hero__actions">
              <button
                type="button"
                className="vip-btn-primary"
                onClick={handleRequestVipTrial}
                disabled={requestedTrial || requestingTrial}
              >
                <FiPhoneCall /> {requestedTrial ? 'Request submitted' : requestingTrial ? 'Submitting…' : 'Request VIP review'}
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
            <h2>Exclusive Personalized VIP Benefits For You</h2>
            <p>Elevate your sports betting & casino gaming with white-glove personal treatment</p>
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
          <div className="vip-spotlight__badge">EXCLUSIVE OFFERS EVERY DAY</div>
          <h2>Daily Cashback, Gifting & Birthday Bonuses</h2>
          <p>
            As a OddsYra VIP member, every day brings customized promotions tailored specifically to your gameplay. From zero-wagering daily cashbacks to luxury surprise gifts, experience top-tier gaming.
          </p>
        </motion.div>

        {/* How to Become a VIP Section */}
        <section className="vip-section vip-how-section">
          <div className="vip-card-box">
            <div className="vip-card-box__icon">
              <FiPhoneCall />
            </div>
            <div className="vip-card-box__content">
              <h2>How to become a VIP?</h2>
              <p>
                You will be invited to join our VIP trial program through a personalized call, message, or in-app pop-up from our VIP Management team.
              </p>
              <div className="vip-how-steps mt-4">
                <div className="vip-step-item">
                  <span className="vip-step-num">1</span>
                  <div>
                    <strong>Play & Earn Coins</strong>
                    <p>Place bets on sports to accumulate loyalty coins. Casino play is not live yet.</p>
                  </div>
                </div>
                <div className="vip-step-item">
                  <span className="vip-step-num">2</span>
                  <div>
                    <strong>Get Personal Invitation</strong>
                    <p>Our VIP Desk reviews account activity daily and dispatches personal invites via WhatsApp & phone.</p>
                  </div>
                </div>
                <div className="vip-step-item">
                  <span className="vip-step-num">3</span>
                  <div>
                    <strong>Unlock Bespoke Privileges</strong>
                    <p>Enjoy direct Account Manager contact, instant payouts, and tailored gifts.</p>
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
                    <td>
                      {row.all ? (
                        <span className="vip-check"><FiCheck /></span>
                      ) : (
                        <span className="vip-cross"><FiMinus /></span>
                      )}
                    </td>
                    <td>
                      {row.preVip ? (
                        <span className="vip-check"><FiCheck /></span>
                      ) : (
                        <span className="vip-cross"><FiMinus /></span>
                      )}
                    </td>
                    <td className="vip-col-highlight">
                      {row.vip ? (
                        <span className="vip-check vip-check--gold"><FiCheck /></span>
                      ) : (
                        <span className="vip-cross"><FiMinus /></span>
                      )}
                    </td>
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
            <Link to="/marketplace" className="vip-btn-gold">
              Explore Loyalty Rewards <FiAward />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
