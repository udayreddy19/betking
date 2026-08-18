import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { fetchUserBonuses, usePromotionCatalog } from '../../hooks/usePromotionCatalog';
import { DEMO_MODE } from '../../utils/featureFlags';
import './Promotions.css';

export default function Promotions() {
  const { openLoginModal, isLoggedIn, claimPromotion, isPromotionClaimed } = useAuth();
  const { catalog, loading, error } = usePromotionCatalog();
  const [activeBonuses, setActiveBonuses] = useState([]);
  const [claimedCodes, setClaimedCodes] = useState(() => new Set());
  const [claimingCode, setClaimingCode] = useState(null);

  useEffect(() => {
    if (!isLoggedIn) {
      setActiveBonuses([]);
      return undefined;
    }

    let cancelled = false;
    fetchUserBonuses()
      .then((bonuses) => {
        if (!cancelled) setActiveBonuses(bonuses);
      })
      .catch(() => {
        if (!cancelled) setActiveBonuses([]);
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
        const bonuses = await fetchUserBonuses();
        setActiveBonuses(bonuses);
      }
    }
  };

  const isClaimed = (promo) => {
    if (DEMO_MODE) return isPromotionClaimed(promo.id);
    if (promo.code && claimedPromoCodes.has(String(promo.code).toUpperCase())) return true;
    return false;
  };

  return (
    <div className="promotions-page container" id="promotions-page">
      <div className="promotions-header">
        <h1>Promotions & Bonuses</h1>
        <p>
          {DEMO_MODE
            ? 'Grab exclusive welcome offers, weekly reloads, free bets, and crypto bonuses!'
            : 'Claim active sports offers below or enter a promo code in your profile.'}
        </p>
      </div>

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

      {!loading && catalog.length > 0 && (
        <div className="promotions-grid">
          {catalog.map((promo) => {
            const claimed = isClaimed(promo);
            const rewardHint = promo.bonusAmount
              ? `Up to ₹${Number(promo.bonusAmount).toLocaleString('en-IN')}`
              : promo.maxReward
                ? `Up to ₹${Number(promo.maxReward).toLocaleString('en-IN')}`
                : null;
            return (
              <div key={promo.id || promo.code} className="promo-item" id={`promo-${promo.code || promo.id}`}>
                <div className="promo-item-banner" style={{ background: promo.gradient || promo.bgColor }}>
                  {promo.tag && <span className="promo-item-tag">{promo.tag}</span>}
                  <h3>{promo.title}</h3>
                </div>
                <div className="promo-item-body">
                  {promo.subtitle && <h4>{promo.subtitle}</h4>}
                  <p>{promo.description}</p>
                  {promo.code && (
                    <p className="promo-bonus-amount">
                      Code: <strong>{promo.code}</strong>
                      {rewardHint ? ` · ${rewardHint}` : ''}
                    </p>
                  )}
                  {DEMO_MODE && promo.bonusAmount && (
                    <p className="promo-bonus-amount">Demo credit: ₹{promo.bonusAmount.toLocaleString('en-IN')}</p>
                  )}
                  <button
                    type="button"
                    className="promo-item-btn"
                    onClick={() => handleClaim(promo)}
                    disabled={claimed || claimingCode === promo.code}
                  >
                    {claimed ? 'Claimed' : claimingCode === promo.code ? 'Claiming…' : 'Claim now'}
                  </button>
                </div>
              </div>
            );
          })}
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
          <h2>Your active bonuses</h2>
          <div className="promotions-grid">
            {activeBonuses.map((bonus) => (
              <div key={bonus.id} className="promo-item">
                <div className="promo-item-body">
                  <h4>{bonus.promo_name || bonus.name || 'Bonus'}</h4>
                  <p>
                    ₹{Number(bonus.bonus_amount || 0).toLocaleString('en-IN')} · Status: {bonus.status}
                  </p>
                  {bonus.wagering_required != null && (
                    <p className="promo-bonus-amount">
                      Wagering: ₹{Number(bonus.wagering_completed || 0).toLocaleString('en-IN')}
                      {' / '}
                      ₹{Number(bonus.wagering_required || 0).toLocaleString('en-IN')}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
