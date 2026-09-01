import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Legacy /admin/iplsrl route — bounce into Admin Shell Sports → OddsYra SRL Console.
 * The full console now lives inside Admin home for a consistent look & auth session.
 */
export default function IPLSRLAdmin() {
  const navigate = useNavigate();

  useEffect(() => {
    try {
      sessionStorage.setItem('adminLandingDomain', 'sports');
      sessionStorage.setItem('adminLandingSubModule', 'iplsrl-console');
      sessionStorage.setItem('adminNavLocation', JSON.stringify({
        domainId: 'sports',
        subModuleId: 'iplsrl-console',
      }));
    } catch { /* ignore */ }
    navigate('/admin/sports/iplsrl-console', { replace: true });
  }, [navigate]);

  return (
    <div style={{ padding: 40, color: 'var(--color-text-muted)' }}>
      Opening OddsYra SRL Console inside Admin…
    </div>
  );
}
