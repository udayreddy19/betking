import { useAuth } from '../../context/AuthContext';
import { promotions } from '../../data/mockData';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import StaggerChildren, { StaggerItem } from '../../components/motion/StaggerChildren';
import FadeIn from '../../components/motion/FadeIn';
import { IoGiftOutline } from '../../icons';
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
      <FadeIn>
        <PageHeader
          title="Promotions & Bonuses"
          subtitle="Grab exclusive welcome offers, weekly reloads, free bets, and crypto bonuses!"
        />
      </FadeIn>

      <StaggerChildren className="promotions-grid">
        {promotions.map((promo) => {
          const claimed = isPromotionClaimed(promo.id);
          return (
            <StaggerItem key={promo.id}>
              <Card interactive className="promo-item" id={`promo-${promo.id}`}>
                <div className="promo-item-banner" style={{ background: promo.gradient }}>
                  <IoGiftOutline size={28} className="promo-item-banner-icon" />
                  <h3>{promo.title}</h3>
                </div>
                <div className="promo-item-body">
                  <h4>{promo.subtitle}</h4>
                  <p>{promo.description}</p>
                  {promo.bonusAmount && (
                    <p className="promo-bonus-amount">Demo credit: ₹{promo.bonusAmount.toLocaleString('en-IN')}</p>
                  )}
                  <Button
                    variant={claimed ? 'secondary' : 'gold'}
                    size="md"
                    className="promo-item-btn"
                    onClick={() => handleClaim(promo)}
                    disabled={claimed}
                  >
                    {claimed ? 'Claimed' : 'Claim Now'}
                  </Button>
                </div>
              </Card>
            </StaggerItem>
          );
        })}
      </StaggerChildren>
    </div>
  );
}
