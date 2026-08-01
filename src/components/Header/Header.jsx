import { NavLink, useNavigate } from 'react-router-dom';
import { HiOutlineMenu } from 'react-icons/hi';
import { IoGiftOutline } from 'react-icons/io5';
import { FiChevronDown } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import { useBetSlip } from '../../context/BetSlipContext';
import ThemeToggle from '../ThemeToggle/ThemeToggle';
import MyBetsPanel from '../MyBetsPanel/MyBetsPanel';
import '../MyBetsPanel/MyBetsPanel.css';
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
  const { myBetsCount, isMyBetsOpen, toggleMyBets } = useBetSlip();
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
          <ThemeToggle />
          <button
            type="button"
            className={`header-my-bets-btn ${isMyBetsOpen ? 'active' : ''}`}
            data-my-bets-trigger
            onClick={toggleMyBets}
            aria-expanded={isMyBetsOpen}
            aria-haspopup="dialog"
          >
            <span className="header-my-bets-label">My bets</span>
            {myBetsCount > 0 && <span className="header-my-bets-badge">{myBetsCount}</span>}
          </button>
          <button className="header-bonuses-btn" id="bonuses-btn" aria-label="Bonuses" onClick={() => navigate('/promotions')}>
            <IoGiftOutline />
          </button>

          {isLoggedIn ? (
            <>
              <div className="header-wallet-group">
                <div className="header-coins" title="Bonus coins">
                  <span className="header-coins-icon">🎁</span>
                  <span>{user.coins ?? 58}</span>
                </div>
                <div className="header-balance" id="header-balance">
                  <span className="balance-icon">₹</span>
                  <span>₹{user.balance.toLocaleString('en-IN')}</span>
                  <FiChevronDown className="balance-chevron" />
                </div>
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
      <MyBetsPanel />
    </header>
  );
}
