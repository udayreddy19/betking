import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import DepositView from '../../components/DepositFlow/DepositView';
import { useAuth } from '../../context/AuthContext';
import { useProducts } from '../../context/ProductContext';
import './DepositPage.css';

export default function DepositPage() {
  const { isLoggedIn, openLoginModal } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { bettingEnabled } = useProducts();
  // Wallet-only mode has no sportsbook, so default back to the wallet.
  const returnTo = location.state?.returnTo || (bettingEnabled ? '/sports' : '/wallet');

  useEffect(() => {
    // If not logged in, prompt login modal
    if (!isLoggedIn) {
      openLoginModal?.();
    }
  }, [isLoggedIn, openLoginModal]);

  return (
    <div className="deposit-page-container">
      <DepositView
        isModal={false}
        returnTo={returnTo}
        onClose={() => navigate(returnTo)}
      />
    </div>
  );
}
