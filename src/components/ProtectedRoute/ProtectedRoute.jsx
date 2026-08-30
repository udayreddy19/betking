import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { isUserAuthorizedForPrivateAccess, PRIVATE_ACCESS_MODE } from '../../utils/privateAccessConfig';

export default function ProtectedRoute({ children }) {
  const { user, isLoggedIn, authStatus, openLoginModal, logout } = useAuth();
  const location = useLocation();

  const isAuthorized = !PRIVATE_ACCESS_MODE || isUserAuthorizedForPrivateAccess(user);

  useEffect(() => {
    if (authStatus === 'anonymous' && !isLoggedIn) {
      openLoginModal();
    }
  }, [authStatus, isLoggedIn, openLoginModal]);

  if (authStatus === 'loading') {
    return (
      <div style={{
        minHeight: '70vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
      }}>
        <div style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          border: '3px solid rgba(99, 102, 241, 0.2)',
          borderTopColor: '#6366f1',
          animation: 'spin 0.8s linear infinite',
        }} />
        <span style={{ fontSize: 13, color: 'var(--color-text-muted, #94a3b8)', fontWeight: 600 }}>
          Verifying authorization...
        </span>
      </div>
    );
  }

  if (!isLoggedIn) {
    const redirectParam = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${redirectParam}`} state={{ from: location }} replace />;
  }

  if (isLoggedIn && !isAuthorized) {
    return (
      <div style={{
        minHeight: '70vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        textAlign: 'center',
        maxWidth: 480,
        margin: '0 auto',
      }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: 'var(--text-primary, #ffffff)' }}>
          Access Restricted
        </h2>
        <p style={{ color: 'var(--text-secondary, #94a3b8)', lineHeight: 1.6, marginBottom: '1.5rem' }}>
          Access to the platform is temporarily restricted while verification processes are completed.
        </p>
        <button
          type="button"
          onClick={() => logout()}
          style={{
            padding: '0.75rem 1.5rem',
            background: '#2563eb',
            color: '#fff',
            borderRadius: 8,
            border: 'none',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Return to Home
        </button>
      </div>
    );
  }

  return children;
}
