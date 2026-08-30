import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function ProtectedRoute({ children }) {
  const { isLoggedIn, authStatus, openLoginModal } = useAuth();
  const location = useLocation();

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

  return children;
}
