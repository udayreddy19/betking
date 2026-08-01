import { useLocation } from 'react-router-dom';
import { useBetSlip } from '../../context/BetSlipContext';
import BetSlipFooter from '../BetSlip/BetSlipFooter';
import './GlobalBetBar.css';

const SPORTS_ROUTES = ['/sports', '/live-betting', '/fantasy'];

export default function GlobalBetBar() {
  const { betCount } = useBetSlip();
  const location = useLocation();

  if (betCount === 0 || SPORTS_ROUTES.includes(location.pathname)) {
    return null;
  }

  return (
    <div className="global-bet-bar">
      <BetSlipFooter variant="floating" />
    </div>
  );
}
