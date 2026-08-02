import { useState, useCallback, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { HiOutlineMenu, HiOutlineClipboardList, IoGiftOutline, FiChevronDown } from '../../icons';
import { useAuth } from '../../context/AuthContext';
import { useBetSlip } from '../../context/BetSlipContext';
import ThemeToggle from '../ThemeToggle/ThemeToggle';
import MyBetsPanel from '../MyBetsPanel/MyBetsPanel';
import PromotionsPanel from '../PromotionsPanel/PromotionsPanel';
import '../MyBetsPanel/MyBetsPanel.css';
import '../PromotionsPanel/PromotionsPanel.css';
import './Header.css';

const navLinks = [
  { to: '/live-betting', label: 'Live Betting' },
  { to: '/sports', label: 'Sports' },
  { to: '/fantasy', label: 'Fantasy' },
  { to: '/promotions', label: 'Win Free' },
];

const moreLinks = [
  { to: '/help', label: 'Help Center' },
  { to: '/promotions', label: 'Promotions' },
  { to: '/profile', label: 'My Profile' },
  { to: '/responsible-gaming', label: 'Responsible Gaming' },
];

export default function Header() {
  const { user, isLoggedIn, openLoginModal, openDepositModal, toggleSidebar } = useAuth();
  const { myBetsCount, isMyBetsOpen, toggleMyBets, closeMyBets } = useBetSlip();
  const [isPromosOpen, setIsPromosOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const moreRef = useRef(null);
  const navigate = useNavigate();

  const coins = user?.coins ?? 58;
  const balance = user?.balance ?? 0;

  useEffect(() => {
    if (!isMoreOpen) return undefined;
    const close = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) setIsMoreOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [isMoreOpen]);

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
            <div className="header-more" ref={moreRef}>
              <button
                type="button"
                className={`header-nav-link header-more-btn ${isMoreOpen ? 'active' : ''}`}
                onClick={() => setIsMoreOpen((o) => !o)}
                aria-expanded={isMoreOpen}
              >
                More <FiChevronDown className="header-more-chevron" />
              </button>
              {isMoreOpen && (
                <div className="header-more-menu">
                  {moreLinks.map((link) => (
                    <button
                      key={link.to}
                      type="button"
                      className="header-more-item"
                      onClick={() => { navigate(link.to); setIsMoreOpen(false); }}
                    >
                      {link.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </nav>
        </div>

        <div className="header-right">
          <ThemeToggle />
          <button
            type="button"
            className={`header-my-bets-btn header-my-bets-btn--compact ${isMyBetsOpen ? 'active' : ''}`}
            data-my-bets-trigger
            onClick={handleMyBetsToggle}
            aria-expanded={isMyBetsOpen}
            aria-haspopup="dialog"
            aria-label="My bets"
          >
            <HiOutlineClipboardList className="header-my-bets-icon" aria-hidden="true" />
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
          </button>

          {isLoggedIn ? (
            <>
              <div className="header-wallet-group">
                <div className="header-loyalty-ring" title="Loyalty points">
                  <span className="header-loyalty-icon">⭐</span>
                  <span>{coins}</span>
                </div>
                <button type="button" className="header-balance" id="header-balance" onClick={openDepositModal}>
                  <span className="balance-wallet-icon">👛</span>
                  <span>₹{balance.toLocaleString('en-IN')}</span>
                  <FiChevronDown className="balance-chevron" />
                </button>
              </div>
              <button className="header-deposit-btn" onClick={openDepositModal} id="deposit-btn">
                Deposit
              </button>
            </>
          ) : (
            <div className="header-auth-buttons">
              <div className="header-wallet-group header-wallet-group--guest">
                <div className="header-loyalty-ring">
                  <span className="header-loyalty-icon">⭐</span>
                  <span>58</span>
                </div>
                <div className="header-balance header-balance--static">
                  <span className="balance-wallet-icon">👛</span>
                  <span>₹0</span>
                  <FiChevronDown className="balance-chevron" />
                </div>
              </div>
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
