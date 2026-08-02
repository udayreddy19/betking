import { useAuth } from '../../context/AuthContext';
import { promotions } from '../../data/mockData';
import './Promotions.css';

export default function Promotions() {
  const { openLoginModal, isLoggedIn, claimPromotion, isPromotionClaimed } = useAuth();

  const handleClaim = (promo) => {
    if (!isLoggedIn) {
      openLoginModal();
      return;
    }
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
                {promo.bonusAmount && (
                  <p className="promo-bonus-amount">Demo credit: ₹{promo.bonusAmount.toLocaleString('en-IN')}</p>
                )}
                <button
                  type="button"
                  className="promo-item-btn"
                  onClick={() => handleClaim(promo)}
                  disabled={claimed}
                >
                  {claimed ? 'Claimed' : 'Claim Now'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
