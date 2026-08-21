import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const EXEMPT_PREFIXES = [
  '/complete-profile',
  '/_oauth/google',
  '/admin',
  '/verify-email',
  '/reset-password',
  '/terms',
  '/privacy',
  '/responsible-gaming',
  '/help',
  '/api-docs',
  '/developer',
];

function isExemptPath(pathname) {
  return EXEMPT_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function userNeedsPhone(user) {
  return Boolean(user) && String(user?.phone || '').replace(/\D/g, '').length < 10;
}

/**
 * After Google (or any) login without a phone number, force the complete-profile step.
 */
export default function PhoneRequiredGate() {
  const { user, isLoggedIn } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoggedIn || !userNeedsPhone(user)) return;
    if (isExemptPath(location.pathname)) return;
    navigate('/complete-profile', { replace: true });
  }, [isLoggedIn, user, location.pathname, navigate]);

  return null;
}
