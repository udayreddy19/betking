import { useState, useCallback } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { HiOutlineMenu, HiOutlineClipboardList } from 'react-icons/hi';
import { IoGiftOutline } from 'react-icons/io5';
import { FiChevronDown } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import { useBetSlip } from '../../context/BetSlipContext';
import { promotions } from '../../data/mockData';
import ThemeToggle from '../ThemeToggle/ThemeToggle';
import MyBetsPanel from '../MyBetsPanel/MyBetsPanel';
import PromotionsPanel from '../PromotionsPanel/PromotionsPanel';
import '../MyBetsPanel/MyBetsPanel.css';
import '../PromotionsPanel/PromotionsPanel.css';
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
  const { myBetsCount, isMyBetsOpen, toggleMyBets, closeMyBets } = useBetSlip();
  const [isPromosOpen, setIsPromosOpen] = useState(false);
  const navigate = useNavigate();

  const togglePromos = useCallback(() => {
    setIsPromosOpen((open) => {
      if (!open) closeMyBets();
      return !open;
    });
  }, [closeMyBets]);

  const closePromos = useCallback(() => setIsPromosOpen(false), []);

  const handleMyBetsToggle = useCallback(() => {
    closePromos();
    toggleMyBets();
  }, [closePromos, toggleMyBets]);

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
            onClick={handleMyBetsToggle}
            aria-expanded={isMyBetsOpen}
            aria-haspopup="dialog"
          >
            <HiOutlineClipboardList className="header-my-bets-icon" aria-hidden="true" />
            <span className="header-my-bets-label">My bets</span>
            {myBetsCount > 0 && <span className="header-my-bets-badge">{myBetsCount}</span>}
          </button>
          <button
            type="button"
            className={`header-bonuses-btn ${isPromosOpen ? 'active' : ''}`}
            id="bonuses-btn"
            data-promos-trigger
            aria-label="Promotions"
            aria-expanded={isPromosOpen}
            aria-haspopup="dialog"
            onClick={togglePromos}
          >
            <IoGiftOutline />
            <span className="header-bonuses-badge">{promotions.length}</span>
          </button>

          {isLoggedIn ? (
            <>
              <div className="header-wallet-group">
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
                <span className="header-join-label-full">Join now</span>
                <span className="header-join-label-short">Join</span>
              </button>
            </div>
          )}
        </div>
      </div>
      <MyBetsPanel />
      <PromotionsPanel isOpen={isPromosOpen} onClose={closePromos} />
    </header>
  );
}
