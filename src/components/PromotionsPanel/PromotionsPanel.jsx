import { useEffect, useMemo, useRef, useState } from 'react';
import { IoClose } from '../../icons';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { fetchUserBonuses, fetchUserSignupPromoClaims, usePromotionCatalog } from '../../hooks/usePromotionCatalog';
import { DEMO_MODE } from '../../utils/featureFlags';
import {
  findClaimedExclusiveSignupPromo,
  isExclusiveSignupPromoLocked,
} from '../../../lib/exclusiveSignupPromos.mjs';
import './PromotionsPanel.css';

export default function PromotionsPanel({ isOpen, onClose }) {
  const { isLoggedIn, openLoginModal, claimPromotion, isPromotionClaimed } = useAuth();
  const panelRef = useRef(null);
  const { catalog, loading } = usePromotionCatalog();
  const [activeBonuses, setActiveBonuses] = useState([]);
  const [claimedCodes, setClaimedCodes] = useState(() => new Set());
  const [claimingCode, setClaimingCode] = useState(null);

  useEffect(() => {
    if (!isOpen || !isLoggedIn) {
      if (!isOpen) {
        setActiveBonuses([]);
      }
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
        if (!cancelled) setActiveBonuses([]);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, isLoggedIn]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };

    const handleClickOutside = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        const trigger = event.target.closest?.('[data-promos-trigger]');
        if (!trigger) onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  const claimedPromoCodes = useMemo(() => {
    const codes = new Set(claimedCodes);
    activeBonuses.forEach((bonus) => {
      if (bonus.code) codes.add(String(bonus.code).toUpperCase());
    });
    return codes;
  }, [activeBonuses, claimedCodes]);

  const exclusiveClaimed = useMemo(
    () => findClaimedExclusiveSignupPromo([...claimedPromoCodes]),
    [claimedPromoCodes],
  );

  const availableCatalog = useMemo(() => {
    return catalog.filter((promo) => {
      if (DEMO_MODE) return !isPromotionClaimed(promo.id);
      const code = promo.code ? String(promo.code).toUpperCase() : '';
      if (!code) return true;
      if (claimedPromoCodes.has(code)) return false;
      if (isExclusiveSignupPromoLocked(code, claimedPromoCodes)) return false;
      return true;
    });
  }, [catalog, claimedPromoCodes, isPromotionClaimed]);

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

  if (!isOpen) return null;

  const promoCount = availableCatalog.length;

  return (
    <>
      <div className="promotions-panel-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="promotions-panel" ref={panelRef} role="dialog" aria-modal="true" aria-label="Promotions">
        <div className="promotions-panel-header">
          <h3>
            Promotions {promoCount > 0 && <span className="promotions-panel-count">{promoCount}</span>}
          </h3>
          <button type="button" className="promotions-panel-close" onClick={onClose} aria-label="Close promotions">
            <IoClose />
          </button>
        </div>

        <div className="promotions-panel-body">
          {loading && !DEMO_MODE && (
            <div className="promotions-panel-empty">
              <p>Loading promotions…</p>
            </div>
          )}

          {!loading && availableCatalog.length > 0 && availableCatalog.map((promo) => (
            <article
              key={promo.id || promo.code}
              className="promotions-panel-card"
              style={{ background: promo.bgColor || promo.gradient }}
            >
              <span className="promotions-panel-tag">{promo.tag || 'PROMOTION'}</span>
              <h4>{promo.title}</h4>
              <p>{promo.description || promo.subtitle}</p>
              {promo.code && (
                <div className="promotions-panel-code">Code: <strong>{promo.code}</strong></div>
              )}
              <button
                type="button"
                className="promotions-panel-claim"
                onClick={() => handleClaim(promo)}
                disabled={claimingCode === promo.code}
              >
                {claimingCode === promo.code ? 'Claiming…' : 'Claim now'}
              </button>
            </article>
          ))}

          {!loading && availableCatalog.length === 0 && (
            <div className="promotions-panel-empty">
              <p>
                {catalog.length > 0
                  ? 'You have claimed the available promotions.'
                  : 'No active promotions right now.'}
              </p>
              <p>
                {exclusiveClaimed
                  ? `Welcome offer ${exclusiveClaimed} is already on this account.`
                  : 'Enter a promo code in your profile when you receive one.'}
              </p>
              <Link
                to={isLoggedIn ? '/profile' : '/register'}
                className="promotions-panel-claim"
                onClick={onClose}
              >
                {isLoggedIn ? 'Enter promo code' : 'Sign up with a code'}
              </Link>
            </div>
          )}
        </div>

        <div className="promotions-panel-footer">
          <Link to="/promotions" className="promotions-panel-link" onClick={onClose}>
            View all promotions
          </Link>
        </div>
      </div>
    </>
  );
}
