import { useEffect, useRef } from 'react';
import { IoClose } from '../../icons';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { promotions } from '../../data/mockData';
import './PromotionsPanel.css';

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === '1' || import.meta.env.DEV;

export default function PromotionsPanel({ isOpen, onClose }) {
  const { isLoggedIn, openLoginModal, claimPromotion, isPromotionClaimed } = useAuth();
  const panelRef = useRef(null);

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

  const handleClaim = (promo) => {
    if (!isLoggedIn) {
      openLoginModal();
      return;
    }
    if (!DEMO_MODE) return;
    claimPromotion(promo);
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="promotions-panel-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="promotions-panel" ref={panelRef} role="dialog" aria-modal="true" aria-label="Promotions">
        <div className="promotions-panel-header">
          <h3>Promotions <span className="promotions-panel-count">{promotions.length}</span></h3>
          <button type="button" className="promotions-panel-close" onClick={onClose} aria-label="Close promotions">
            <IoClose />
          </button>
        </div>

        <div className="promotions-panel-body">
          {promotions.map((promo) => {
            const claimed = isPromotionClaimed(promo.id);
            return (
            <article key={promo.id} className="promotions-panel-card" style={{ background: promo.bgColor || promo.gradient }}>
              <span className="promotions-panel-tag">{promo.tag || 'PROMOTION'}</span>
              <h4>{promo.title}</h4>
              <p>{promo.description}</p>
              {promo.code && (
                <div className="promotions-panel-code">Code: <strong>{promo.code}</strong></div>
              )}
              {DEMO_MODE ? (
                <button
                  type="button"
                  className="promotions-panel-claim"
                  onClick={() => handleClaim(promo)}
                  disabled={claimed}
                >
                  {claimed ? 'Claimed' : 'Claim now'}
                </button>
              ) : (
                <Link to={isLoggedIn ? '/profile' : '/register'} className="promotions-panel-claim" onClick={onClose}>
                  {isLoggedIn ? 'Enter promo code' : 'Sign up with a code'}
                </Link>
              )}
            </article>
            );
          })}
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
