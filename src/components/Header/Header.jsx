import { NavLink, useNavigate } from 'react-router-dom';
import { HiOutlineMenu } from 'react-icons/hi';
import { IoGiftOutline } from 'react-icons/io5';
import { FiChevronDown } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import ThemeToggle from '../ThemeToggle/ThemeToggle';
import './Header.css';

const navLinks = [
  { to: '/live-betting', label: 'Live Betting' },
  { to: '/sports', label: 'Sports' },
  { to: '/casino', label: 'Casino' },
  { to: '/live-casino', label: 'Live Casino' },
  { to: '/fantasy', label: 'Fantasy' },
  { to: '/promotions', label: 'Win Free' },
];

export default function Header() {
  const { user, isLoggedIn, openLoginModal, openDepositModal, toggleSidebar } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="header" id="main-header">
      <div className="header-inner">
        <div className="header-left">
          <button className="header-menu-btn" onClick={toggleSidebar} id="menu-toggle" aria-label="Menu">
            <HiOutlineMenu />
            <span className="menu-dot" />
          </button>

          <NavLink to="/" className="header-logo" id="header-logo">
            <span className="logo-icon logo-icon-circle">10</span>
            <span className="logo-text">CRIC</span>
          </NavLink>

          <nav className="header-nav" id="main-nav">
            {navLinks.map(link => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) => `header-nav-link ${isActive ? 'active' : ''}`}
                id={`nav-${link.to.slice(1)}`}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="header-right">
          <span className="header-test-mode" title="Virtual balance only — no real money">Test Mode</span>
          <ThemeToggle />
          <button className="header-bonuses-btn" id="bonuses-btn" aria-label="Bonuses" onClick={() => navigate('/promotions')}>
            <IoGiftOutline />
          </button>

          {isLoggedIn ? (
            <>
              <div className="header-balance" id="header-balance">
                <span className="balance-icon">₹</span>
                <span>₹{user.balance.toLocaleString('en-IN')}</span>
                <FiChevronDown className="balance-chevron" />
              </div>
              <button className="header-deposit-btn" onClick={openDepositModal} id="deposit-btn">
                Deposit
              </button>
            </>
          ) : (
            <div className="header-auth-buttons">
              <button className="header-login-btn" onClick={openLoginModal} id="login-btn">
                Log in
              </button>
              <button className="header-join-btn" onClick={() => navigate('/register')} id="join-btn">
                Join now
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
