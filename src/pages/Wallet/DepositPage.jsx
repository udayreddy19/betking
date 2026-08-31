import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import DepositView from '../../components/DepositFlow/DepositView';
import { useAuth } from '../../context/AuthContext';
import './DepositPage.css';

export default function DepositPage() {
  const { isLoggedIn, openLoginModal } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

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
        returnTo={location.state?.returnTo || '/sports'}
        onClose={() => navigate(location.state?.returnTo || '/sports')}
      />
    </div>
  );
}
