import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Legacy /admin/iplsrl route — bounce into Admin Shell Sports → IPLSRL Console.
 * The full console now lives inside Admin home for a consistent look & auth session.
 */
export default function IPLSRLAdmin() {
  const navigate = useNavigate();

  useEffect(() => {
    // Persist intended submodule for AdminShell to pick up on mount.
    try {
      sessionStorage.setItem('adminLandingDomain', 'sports');
      sessionStorage.setItem('adminLandingSubModule', 'iplsrl-console');
    } catch { /* ignore */ }
    navigate('/admin', { replace: true });
  }, [navigate]);

  return (
    <div style={{ padding: 40, color: 'var(--color-text-muted)' }}>
      Opening IPLSRL Control Console inside Admin…
    </div>
  );
}
