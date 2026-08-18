import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { promotions } from '../../data/mockData';
import './Promotions.css';

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === '1' || import.meta.env.DEV;

export default function Promotions() {
  const { openLoginModal, isLoggedIn, claimPromotion, isPromotionClaimed } = useAuth();

  const handleClaim = (promo) => {
    if (!isLoggedIn) {
      openLoginModal();
      return;
    }
    if (!DEMO_MODE) return;
    claimPromotion(promo);
  };

  return (
    <div className="promotions-page container" id="promotions-page">
      <div className="promotions-header">
        <h1>Promotions & Bonuses</h1>
        <p>Grab exclusive welcome offers, weekly reloads, free bets, and crypto bonuses!</p>
      </div>

      <div className="promotions-grid">
        {promotions.map(promo => {
          const claimed = isPromotionClaimed(promo.id);
          return (
            <div key={promo.id} className="promo-item" id={`promo-${promo.id}`}>
              <div className="promo-item-banner" style={{ background: promo.gradient }}>
                <h3>{promo.title}</h3>
              </div>
              <div className="promo-item-body">
                <h4>{promo.subtitle}</h4>
                <p>{promo.description}</p>
                {promo.bonusAmount && DEMO_MODE && (
                  <p className="promo-bonus-amount">Demo credit: ₹{promo.bonusAmount.toLocaleString('en-IN')}</p>
                )}
                {DEMO_MODE ? (
                  <button
                    type="button"
                    className="promo-item-btn"
                    onClick={() => handleClaim(promo)}
                    disabled={claimed}
                  >
                    {claimed ? 'Claimed' : 'Claim Now'}
                  </button>
                ) : (
                  <Link to={isLoggedIn ? '/profile' : '/register'} className="promo-item-btn">
                    {isLoggedIn ? 'Enter promo code' : 'Sign up with a code'}
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
