import { promotions } from '../../data/mockData';
import { useAuth } from '../../context/AuthContext';
import './Promotions.css';

export default function Promotions() {
  const { showToast, openLoginModal, isLoggedIn } = useAuth();

  const handleClaim = (promo) => {
    if (!isLoggedIn) {
      showToast('Please log in to claim this promotion.');
      openLoginModal();
      return;
    }
    showToast(`${promo.title} claimed! Bonus will be credited on your next deposit.`);
  };

  return (
    <div className="promotions-page container" id="promotions-page">
      <div className="promotions-header">
        <h1>Promotions & Bonuses</h1>
        <p>Grab exclusive welcome offers, weekly reloads, free bets, and crypto bonuses!</p>
      </div>

      <div className="promotions-grid">
        {promotions.map(promo => (
          <div key={promo.id} className="promo-item" id={`promo-${promo.id}`}>
            <div className="promo-item-banner" style={{ background: promo.gradient }}>
              <h3>{promo.title}</h3>
            </div>
            <div className="promo-item-body">
              <h4>{promo.subtitle}</h4>
              <p>{promo.description}</p>
              <button type="button" className="promo-item-btn" onClick={() => handleClaim(promo)}>Claim Now</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
