import { useState, useCallback, useRef, useEffect, memo } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { HiOutlineMenu, HiOutlineClipboardList, IoGiftOutline, FiChevronDown } from '../../icons';
import { useAuth } from '../../context/AuthContext';
import { useBetSlip } from '../../context/BetSlipContext';
import { getWalletBreakdown, formatInr } from '../../utils/walletBalance';
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

const moreLinks = [
  { to: '/help', label: 'Help Center' },
  { to: '/promotions', label: 'Promotions' },
  { to: '/casino', label: 'Casino' },
  { to: '/profile', label: 'My Profile' },
  { to: '/responsible-gaming', label: 'Responsible Gaming' },
];

function Header() {
  const { user, isLoggedIn, openLoginModal, openDepositModal, toggleSidebar } = useAuth();
  const { myBetsCount, isMyBetsOpen, toggleMyBets, closeMyBets } = useBetSlip();
  const [isPromosOpen, setIsPromosOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isWalletOpen, setIsWalletOpen] = useState(false);
  const moreRef = useRef(null);
  const walletRef = useRef(null);
  const navigate = useNavigate();

  const wallet = getWalletBreakdown(user);

  const coins = user?.coins ?? 58;

  useEffect(() => {
    if (!isMoreOpen) return undefined;
    const close = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) setIsMoreOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [isMoreOpen]);

  useEffect(() => {
    if (!isWalletOpen) return undefined;
    const close = (e) => {
      if (walletRef.current && !walletRef.current.contains(e.target)) setIsWalletOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [isWalletOpen]);

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
              <div className="header-wallet-group" ref={walletRef}>
                <div className="header-loyalty-ring" title="Loyalty points">
                  <span className="header-loyalty-icon">⭐</span>
                  <span>{coins}</span>
                </div>
                <div className="header-wallet-dropdown-wrap">
                  <button
                    type="button"
                    className={`header-balance ${isWalletOpen ? 'active' : ''}`}
                    id="header-balance"
                    onClick={() => setIsWalletOpen((open) => !open)}
                    aria-expanded={isWalletOpen}
                    aria-haspopup="true"
                  >
                    <span className="balance-wallet-icon">👛</span>
                    <span>{formatInr(wallet.total)}</span>
                    <FiChevronDown className={`balance-chevron ${isWalletOpen ? 'open' : ''}`} />
                  </button>
                  {isWalletOpen && (
                    <div className="header-wallet-menu" role="menu">
                      <div className="header-wallet-menu__row">
                        <span className="header-wallet-menu__label">Balance</span>
                        <span className="header-wallet-menu__value">{formatInr(wallet.total)}</span>
                      </div>
                      <div className="header-wallet-menu__row">
                        <span className="header-wallet-menu__label">Bonus / Freebets</span>
                        <span className="header-wallet-menu__value header-wallet-menu__value--bonus">
                          {formatInr(wallet.bonusAndFreebets)}
                        </span>
                      </div>
                      <div className="header-wallet-menu__row header-wallet-menu__row--highlight">
                        <span className="header-wallet-menu__label">Withdrawable balance</span>
                        <span className="header-wallet-menu__value">{formatInr(wallet.withdrawable)}</span>
                      </div>
                      <button
                        type="button"
                        className="header-wallet-menu__deposit"
                        onClick={() => {
                          setIsWalletOpen(false);
                          openDepositModal();
                        }}
                      >
                        Deposit
                      </button>
                    </div>
                  )}
                </div>
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

export default memo(Header);
