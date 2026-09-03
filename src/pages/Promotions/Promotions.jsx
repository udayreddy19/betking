import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  fetchUserBonuses,
  fetchUserSignupPromoClaims,
  usePromotionCatalog,
} from '../../hooks/usePromotionCatalog';
import { DEMO_MODE } from '../../utils/featureFlags';
import { isExclusiveSignupPromoLocked } from '../../../lib/exclusiveSignupPromos.mjs';
import './Promotions.css';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'freebet', label: 'Free bets' },
  { id: 'welcome', label: 'Welcome' },
  { id: 'reload', label: 'Reload' },
];

function promoKind(promo) {
  const tag = String(promo.tag || '').toUpperCase();
  const type = String(promo.type || promo.rewardType || '').toLowerCase();
  const code = String(promo.code || '').toUpperCase();
  if (type === 'freebet' || tag.includes('FREE BET') || code === 'SPORTS500' || code === 'LIVE100') {
    return 'freebet';
  }
  if (tag.includes('NEW') || tag.includes('VIP') || tag.includes('WELCOME') || code.startsWith('WELCOME') || code === 'VIP1000') {
    return 'welcome';
  }
  if (tag.includes('RELOAD') || code.includes('RELOAD')) {
    return 'reload';
  }
  return 'other';
}

function rewardLabel(promo) {
  if (promo.bonusAmount) {
    return `₹${Number(promo.bonusAmount).toLocaleString('en-IN')}`;
  }
  if (promo.maxReward) {
    return `Up to ₹${Number(promo.maxReward).toLocaleString('en-IN')}`;
  }
  if (promo.matchPercent) {
    return `${promo.matchPercent}% match`;
  }
  return null;
}

function isPromoUsed(promo, {
  demoMode,
  isPromotionClaimed,
  claimedPromoCodes,
}) {
  if (demoMode) return Boolean(isPromotionClaimed?.(promo.id));
  const code = promo.code ? String(promo.code).toUpperCase() : '';
  if (!code) return false;
  if (claimedPromoCodes.has(code)) return true;
  if (isExclusiveSignupPromoLocked(code, claimedPromoCodes)) return true;
  return false;
}

function PromoCard({ promo, claiming, onClaim }) {
  const reward = rewardLabel(promo);
  return (
    <article className="promo-item" id={`promo-${promo.code || promo.id}`}>
      <div className="promo-item-accent" style={{ background: promo.gradient || promo.bgColor }} aria-hidden="true" />
      <div className="promo-item-banner" style={{ background: promo.gradient || promo.bgColor }}>
        {promo.tag && <span className="promo-item-tag">{promo.tag}</span>}
        <h3>{promo.title}</h3>
        {reward && <p className="promo-item-banner-reward">{reward}</p>}
      </div>
      <div className="promo-item-body">
        <div className="promo-item-body-top">
          {promo.tag && <span className="promo-item-tag promo-item-tag--inline">{promo.tag}</span>}
          {reward && <span className="promo-item-reward-pill">{reward}</span>}
        </div>
        <h3 className="promo-item-title-mobile">{promo.title}</h3>
        {promo.subtitle && <h4>{promo.subtitle}</h4>}
        <p>{promo.description}</p>
        {promo.code && (
          <p className="promo-bonus-amount">
            Code: <strong>{promo.code}</strong>
          </p>
        )}
        {DEMO_MODE && promo.bonusAmount && (
          <p className="promo-bonus-amount">Demo credit: ₹{promo.bonusAmount.toLocaleString('en-IN')}</p>
        )}
        <button
          type="button"
          className="promo-item-btn"
          onClick={() => onClaim(promo)}
          disabled={claiming}
        >
          {claiming ? 'Claiming…' : 'Claim now'}
        </button>
      </div>
    </article>
  );
}

export default function Promotions() {
  const { openLoginModal, isLoggedIn, claimPromotion, isPromotionClaimed } = useAuth();
  const { catalog, loading, error } = usePromotionCatalog();
  const [activeBonuses, setActiveBonuses] = useState([]);
  const [claimedCodes, setClaimedCodes] = useState(() => new Set());
  const [claimingCode, setClaimingCode] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (!isLoggedIn) {
      setActiveBonuses([]);
      setClaimedCodes(new Set());
      return undefined;
    }

    let cancelled = false;
    Promise.all([fetchUserBonuses(), fetchUserSignupPromoClaims()])
      .then(([bonuses, claims]) => {
        if (cancelled) return;
        setActiveBonuses(bonuses);
        setClaimedCodes(new Set((claims || []).map((c) => String(c.code || '').toUpperCase()).filter(Boolean)));
      })
      .catch(() => {
        if (!cancelled) {
          setActiveBonuses([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  const claimedPromoCodes = useMemo(() => {
    const codes = new Set(claimedCodes);
    activeBonuses.forEach((bonus) => {
      if (bonus.code) codes.add(String(bonus.code).toUpperCase());
    });
    return codes;
  }, [activeBonuses, claimedCodes]);

  const availableCatalog = useMemo(
    () => catalog.filter((promo) => !isPromoUsed(promo, {
      demoMode: DEMO_MODE,
      isPromotionClaimed,
      claimedPromoCodes,
    })),
    [catalog, claimedPromoCodes, isPromotionClaimed],
  );

  const filteredCatalog = useMemo(() => {
    if (filter === 'all') return availableCatalog;
    return availableCatalog.filter((promo) => promoKind(promo) === filter);
  }, [availableCatalog, filter]);

  const handleClaim = async (promo) => {
    if (!isLoggedIn) {
      openLoginModal();
      return;
    }
    setClaimingCode(promo.code);
    const result = await claimPromotion(promo);
    setClaimingCode(null);
    if (result?.ok && promo.code) {
      setClaimedCodes((prev) => new Set(prev).add(String(promo.code).toUpperCase()));
      if (!DEMO_MODE) {
        const [bonuses, claims] = await Promise.all([fetchUserBonuses(), fetchUserSignupPromoClaims()]);
        setActiveBonuses(bonuses);
        setClaimedCodes(new Set((claims || []).map((c) => String(c.code || '').toUpperCase()).filter(Boolean)));
      }
    }
  };

  return (
    <div className="promotions-page container" id="promotions-page">
      <header className="promotions-header">
        <div className="promotions-header-copy">
          <p className="promotions-kicker">Offers</p>
          <h1>Promotions</h1>
          <p>
            {DEMO_MODE
              ? 'Grab exclusive welcome offers, weekly reloads, free bets, and crypto bonuses!'
              : 'Claim sports offers below, or enter a promo code on your profile.'}
          </p>
        </div>
        {!loading && availableCatalog.length > 0 && (
          <div className="promotions-header-stat" aria-label="Available promotions">
            <strong>{availableCatalog.length}</strong>
            <span>live</span>
          </div>
        )}
      </header>

      {!loading && availableCatalog.length > 0 && (
        <div className="promotions-filters" role="tablist" aria-label="Filter promotions">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={filter === item.id}
              className={`promotions-filter-chip${filter === item.id ? ' is-active' : ''}`}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {loading && !DEMO_MODE && (
        <div className="promotions-empty-state">
          <p>Loading promotions…</p>
        </div>
      )}

      {!loading && error && !DEMO_MODE && (
        <div className="promotions-empty-state">
          <p>{error}</p>
        </div>
      )}

      {!loading && filteredCatalog.length > 0 && (
        <div className="promotions-grid">
          {filteredCatalog.map((promo) => (
            <PromoCard
              key={promo.id || promo.code}
              promo={promo}
              claiming={claimingCode === promo.code}
              onClaim={handleClaim}
            />
          ))}
        </div>
      )}

      {!loading && availableCatalog.length > 0 && filteredCatalog.length === 0 && (
        <div className="promotions-empty-state">
          <h2>No offers in this filter</h2>
          <p>Try another category or view all live promotions.</p>
          <button type="button" className="promo-item-btn" onClick={() => setFilter('all')}>
            Show all
          </button>
        </div>
      )}

      {!loading && !error && availableCatalog.length === 0 && catalog.length > 0 && (
        <div className="promotions-empty-state">
          <h2>You&apos;ve claimed the available offers</h2>
          <p>Claimed promotions are removed from this list. Check active bonuses below, or enter a new code on your profile.</p>
          <Link to={isLoggedIn ? '/profile' : '/register'} className="promo-item-btn">
            {isLoggedIn ? 'Go to profile' : 'Create an account'}
          </Link>
        </div>
      )}

      {!loading && !DEMO_MODE && catalog.length === 0 && !error && (
        <div className="promotions-empty-state">
          <h2>No public promotions right now</h2>
          <p>Check back soon — or enter a promo code on your profile if you received one.</p>
          <Link to={isLoggedIn ? '/profile' : '/register'} className="promo-item-btn">
            {isLoggedIn ? 'Go to profile' : 'Create an account'}
          </Link>
        </div>
      )}

      {!DEMO_MODE && isLoggedIn && activeBonuses.length > 0 && (
        <section className="promotions-active-bonuses">
          <div className="promotions-section-head">
            <h2>Your active bonuses</h2>
            <span>{activeBonuses.length}</span>
          </div>
          <div className="promotions-active-list">
            {activeBonuses.map((bonus) => {
              const bonusAmt = Number(bonus.bonus_amount || bonus.bonusAmount || 0);
              const required = Number(bonus.wagering_required || bonus.wageringRequired || 0);
              const done = Number(bonus.wagering_completed || bonus.wageringCompleted || 0);
              const remaining = Math.max(0, required - done);
              const progress = required > 0 ? Math.min(100, Math.round((done / required) * 100)) : 0;
              const isCompleted = bonus.status === 'COMPLETED' || bonus.status === 'RELEASED' || (required > 0 && done >= required);
              const lockedWinnings = Number(bonus.locked_winnings || bonus.lockedWinnings || 0);

              return (
                <div key={bonus.id || bonus.bonusId} className="promo-active-card">
                  <div className="promo-active-card__top">
                    <h4>{bonus.promo_name || bonus.promotionName || bonus.name || 'Bonus'}</h4>
                    <span className={`promo-active-status ${isCompleted ? 'promo-active-status--completed' : ''}`}>
                      {isCompleted ? '✓ COMPLETED' : 'IN PROGRESS'}
                    </span>
                  </div>
                  <p className="promo-active-amount">
                    ₹{bonusAmt.toLocaleString('en-IN')} Bonus
                  </p>

                  <div className="promo-wagering-details" style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '8px 0', lineHeight: '1.6' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Wagering Requirement:</span>
                      <strong style={{ color: '#f8fafc' }}>5x</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Required Turnover:</span>
                      <strong style={{ color: '#f8fafc' }}>₹{required.toLocaleString('en-IN')}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Completed Turnover:</span>
                      <strong style={{ color: '#38bdf8' }}>₹{done.toLocaleString('en-IN')}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Remaining Turnover:</span>
                      <strong style={{ color: remaining > 0 ? '#fbbf24' : '#4ade80' }}>₹{remaining.toLocaleString('en-IN')}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Min. Qualifying Odds:</span>
                      <strong style={{ color: '#f8fafc' }}>1.75</strong>
                    </div>
                    {lockedWinnings > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                        <span>Locked Winnings:</span>
                        <strong style={{ color: '#a855f7' }}>₹{lockedWinnings.toLocaleString('en-IN')}</strong>
                      </div>
                    )}
                  </div>

                  {required > 0 && (
                    <>
                      <div className="promo-active-bar" aria-hidden="true" style={{ marginTop: 8 }}>
                        <div style={{ width: `${progress}%`, background: isCompleted ? '#22c55e' : 'linear-gradient(90deg, #38bdf8, #818cf8)' }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginTop: 4 }}>
                        <span style={{ color: '#94a3b8' }}>Progress</span>
                        <span style={{ fontWeight: 700, color: isCompleted ? '#4ade80' : '#38bdf8' }}>{progress}%</span>
                      </div>
                    </>
                  )}

                  {isCompleted && (
                    <p style={{ fontSize: '0.85rem', color: '#4ade80', marginTop: 10, fontWeight: 600 }}>
                      ✓ WAGERING COMPLETED — Eligible winnings are available in cash according to bonus terms.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
