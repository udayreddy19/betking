import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useComplianceDemo } from '../../hooks/useComplianceDemo';
import '../../styles/complianceDesk.css';

const NAV = [
  { to: '/desk', label: 'Solutions', end: true },
  { to: '/desk/enroll', label: 'Order' },
  { to: '/desk/records', label: 'Records' },
  { to: '/desk/institute', label: 'Company' },
];

const PASSTHROUGH_PREFIXES = [
  '/desk',
  '/company',
  '/terms',
  '/privacy',
  '/admin',
  '/documents',
  '/help',
  '/support',
];

export default function ComplianceShell() {
  const auth = useAuth();
  const user = auth?.user;
  const isLoggedIn = Boolean(auth?.isLoggedIn || user);
  const logout = typeof auth?.logout === 'function' ? auth.logout : null;
  const openLoginModal = typeof auth?.openLoginModal === 'function' ? auth.openLoginModal : null;
  const { copy } = useComplianceDemo();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    document.body.classList.add('oy-compliance-demo', 'fd-body');
    document.title = `${copy.legalBusinessName} · ${copy.productName}`;
    return () => {
      document.body.classList.remove('oy-compliance-demo', 'fd-body');
    };
  }, [copy.legalBusinessName, copy.productName]);

  useEffect(() => {
    const path = location.pathname;
    if (path === '/desk/charge' || path.startsWith('/desk/charge')) {
      navigate(`/desk/enroll${location.search || ''}`, { replace: true });
      return;
    }
    if (path === '/desk/settlements' || path === '/desk/statements' || path === '/desk/business') {
      const map = {
        '/desk/settlements': '/desk/records',
        '/desk/statements': '/desk/records',
        '/desk/business': '/desk/institute',
      };
      navigate(map[path] || '/desk', { replace: true });
      return;
    }
    const allowed = PASSTHROUGH_PREFIXES.some(
      (p) => path === p || path.startsWith(`${p}/`),
    );
    if (allowed) return;
    navigate('/desk', { replace: true });
  }, [location.pathname, location.search, navigate]);

  async function doLogout() {
    if (!logout) return;
    await logout();
    navigate('/desk');
  }

  function doLogin() {
    if (openLoginModal) {
      openLoginModal();
      return;
    }
    navigate('/admin');
  }

  return (
    <div className="fd-shell">
      <header className="fd-top">
        <div className="fd-brand">
          <span className="fd-brand-mark" aria-hidden>V</span>
          <div>
            <p className="fd-product">{copy.productName}</p>
            <p className="fd-legal">{copy.legalBusinessName}</p>
          </div>
        </div>

        <nav className="fd-nav" aria-label={copy.productName}>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `fd-nav-link${isActive ? ' active' : ''}`}
            >
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="fd-top-actions">
          {isLoggedIn && logout ? (
            <button type="button" className="oy-btn oy-btn-ghost fd-logout" onClick={doLogout}>
              <span>Sign out</span>
            </button>
          ) : (
            <button type="button" className="oy-btn oy-btn-ghost fd-logout" onClick={doLogin}>
              <span>Log in</span>
            </button>
          )}
        </div>
      </header>

      <main className="fd-main">
        <Outlet />
      </main>

      <nav className="fd-mobile-nav" aria-label="Mobile">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `fd-mnav${isActive ? ' active' : ''}`}
          >
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <footer className="fd-foot">
        <span>{copy.legalBusinessName}</span>
        <span aria-hidden>·</span>
        <span>{copy.tagline}</span>
        <span aria-hidden>·</span>
        <Link to="/company">Company</Link>
        <span aria-hidden>·</span>
        <Link to="/terms">Terms</Link>
        <span aria-hidden>·</span>
        <Link to="/privacy">Privacy</Link>
        {user?.email ? (
          <>
            <span aria-hidden>·</span>
            <span>{user.email}</span>
          </>
        ) : null}
      </footer>
    </div>
  );
}
