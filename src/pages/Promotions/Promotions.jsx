import { promotions } from '../../data/mockData';
import './Promotions.css';

export default function Promotions() {
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
              <button className="promo-item-btn">Claim Now</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
