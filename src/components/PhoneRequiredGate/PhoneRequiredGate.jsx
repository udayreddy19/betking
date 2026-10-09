import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

/**
 * DOB/phone are required for deposit checkout only.
 * Wallet overview, transactions, and bank accounts stay browsable;
 * withdraw/deposit modals enforce the same checks in AuthProvider.
 */
const STRICT_MONEY_PATHS = ['/wallet/deposit', '/deposit'];

function isStrictMoneyPath(pathname) {
  return STRICT_MONEY_PATHS.some((prefix) => (
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  ));
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
    if (!isStrictMoneyPath(location.pathname)) return;
    const next = encodeURIComponent(`${location.pathname}${location.search || ''}`);
    navigate(`/complete-profile?next=${next}`, { replace: true });
  }, [isLoggedIn, user, location.pathname, location.search, navigate]);

  return null;
}
