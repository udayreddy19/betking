import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

/**
 * Phone is only required for money movement (deposit / withdraw),
 * not for browsing sports after Google signup.
 */
const MONEY_PATH_PREFIXES = ['/wallet'];

function isMoneyPath(pathname) {
  return MONEY_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function userNeedsPhone(user) {
  return Boolean(user) && String(user?.phone || '').replace(/\D/g, '').length < 10;
}

export function userNeedsDob(user) {
  return Boolean(user) && !String(user?.dateOfBirth || '').slice(0, 10).match(/^\d{4}-\d{2}-\d{2}$/);
}

export function userNeedsCompleteProfile(user) {
  return userNeedsPhone(user) || userNeedsDob(user);
}

export default function PhoneRequiredGate() {
  const { user, isLoggedIn } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoggedIn || !userNeedsCompleteProfile(user)) return;
    if (!isMoneyPath(location.pathname)) return;
    const next = encodeURIComponent(`${location.pathname}${location.search || ''}`);
    navigate(`/complete-profile?next=${next}`, { replace: true });
  }, [isLoggedIn, user, location.pathname, location.search, navigate]);

  return null;
}
