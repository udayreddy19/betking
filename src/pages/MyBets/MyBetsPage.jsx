import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useBetSlip } from '../../context/BetSlipContext';
import MyBetsPanel from '../../components/MyBetsPanel/MyBetsPanel';
import './MyBetsPage.css';

export default function MyBetsPage() {
  const { isLoggedIn, openLoginModal } = useAuth();
  const { refreshMyBets } = useBetSlip();

  useEffect(() => {
    if (!isLoggedIn) {
      openLoginModal?.();
      return undefined;
    }
    void refreshMyBets();
    return undefined;
  }, [isLoggedIn, openLoginModal, refreshMyBets]);

  if (!isLoggedIn) {
    return <Navigate to="/sports" replace />;
  }

  return (
    <div className="my-bets-page">
      <header className="my-bets-page-header">
        <h1>My bets</h1>
        <p>Open, settled, and cashed-out bets. Cash out and settlement evidence live on each card.</p>
      </header>
      <MyBetsPanel layout="page" />
    </div>
  );
}
