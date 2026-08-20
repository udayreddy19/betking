import React, { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CircleCheckIcon, InfoIcon, XIcon, ShieldCheckIcon } from '../../../icons/animate/index';

const AdminToastContext = createContext({
  showToast: (_message, _type = 'success') => {},
});

export function AdminToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <AdminToastContext.Provider value={{ showToast }}>
      {children}

      {/* Floating Modern Toast Stack */}
      <div
        style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          maxWidth: '380px',
          pointerEvents: 'none',
        }}
      >
        <AnimatePresence>
          {toasts.map((toast) => {
            const isSuccess = toast.type === 'success';
            const isError = toast.type === 'error';
            return (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, y: -20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -15, scale: 0.9 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                style={{
                  pointerEvents: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '14px 18px',
                  borderRadius: '10px',
                  background: 'var(--admin-panel)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  border: isSuccess
                    ? '1px solid rgba(16, 185, 129, 0.4)'
                    : isError
                    ? '1px solid rgba(239, 68, 68, 0.4)'
                    : '1px solid rgba(59, 130, 246, 0.4)',
                  boxShadow: isSuccess
                    ? '0 8px 32px rgba(16, 185, 129, 0.25)'
                    : isError
                    ? '0 8px 32px rgba(239, 68, 68, 0.25)'
                    : '0 8px 32px rgba(59, 130, 246, 0.25)',
                  color: 'var(--admin-text)',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                }}
              >
                {isSuccess && <CircleCheckIcon style={{ width: '20px', height: '20px', color: '#34d399', flexShrink: 0 }} />}
                {isError && <ShieldCheckIcon style={{ width: '20px', height: '20px', color: '#f87171', flexShrink: 0 }} />}
                {!isSuccess && !isError && <InfoIcon style={{ width: '20px', height: '20px', color: '#60a5fa', flexShrink: 0 }} />}

                <div style={{ flex: 1, lineHeight: '1.4' }}>{toast.message}</div>

                <button
                  onClick={() => removeToast(toast.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--admin-text-muted)',
                    cursor: 'pointer',
                    padding: '2px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <XIcon style={{ width: '14px', height: '14px' }} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </AdminToastContext.Provider>
  );
}

export function useAdminToast() {
  return useContext(AdminToastContext);
}
