import { useState, useCallback, useRef, useEffect, memo } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { HiOutlineMenu, HiOutlineClipboardList, HiOutlineUser, IoGiftOutline, FiChevronDown, FiZap, FiShield, IoNotifications } from '../../icons';
import { useAuth } from '../../context/AuthContext';
import { useBetSlip } from '../../context/BetSlipContext';
import { getWalletBreakdown, formatInr } from '../../utils/walletBalance';
import { getLoyaltySummary, LOYALTY_MIN_REDEEM_POINTS } from '../../utils/loyaltyPoints';
import ThemeToggle from '../ThemeToggle/ThemeToggle';
import MyBetsPanel from '../MyBetsPanel/MyBetsPanel';
import PromotionsPanel from '../PromotionsPanel/PromotionsPanel';
import RupeeSymbol from '../RupeeSymbol/RupeeSymbol';
import DailySpinModal from '../DailySpinModal/DailySpinModal';
import AnimatedMotionGiftIcon from '../AnimatedMotionGiftIcon/AnimatedMotionGiftIcon';
import { ODDS_FORMAT_OPTIONS } from '../../utils/oddsFormatter';
import { storageGet, storageSet } from '../../utils/browserCompat';
import { hasValidAdminSession } from '../../utils/adminSession';
import { apiFetch } from '../../utils/apiClient';
import '../MyBetsPanel/MyBetsPanel.css';
import '../PromotionsPanel/PromotionsPanel.css';
import BrandLogo, { BrandWordmark } from '../BrandLogo/BrandLogo';
import { withoutCasinoLinks } from '../../utils/featureFlags';
import { hoverScale, pressScale, springUi } from '../../utils/motionPresets';
import './Header.css';

const navLinks = withoutCasinoLinks([
  { to: '/live-betting', label: 'Live Betting' },
  { to: '/sports', label: 'Sports' },
  { to: '/casino', label: 'Casino' },
  { to: '/live-casino', label: 'Live Casino' },
  { to: '/fantasy', label: 'Fantasy' },
  { to: '/promotions', label: 'Win Free' },
]);

const moreLinks = withoutCasinoLinks([
  { to: '/profile', label: 'My Profile' },
  { to: '/admin', label: '🛡️ Admin Portal' },
  { to: '/help', label: 'Help Center' },
  { to: '/promotions', label: 'Promotions' },
  { to: '/casino', label: 'Casino' },
  { to: '/responsible-gaming', label: 'Responsible Gaming' },
]);

function Header() {
  const { user, isLoggedIn, openLoginModal, openDepositModal, toggleSidebar, redeemLoyaltyPoints, openFinModal } = useAuth();
  const { myBetsCount, isMyBetsOpen, toggleMyBets, closeMyBets } = useBetSlip();
  const [isPromosOpen, setIsPromosOpen] = useState(false);
  const [isSpinOpen, setIsSpinOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isWalletOpen, setIsWalletOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [userNotifications, setUserNotifications] = useState([]);
  const [oddsFormat, setOddsFormat] = useState(() => storageGet('oddsyra_odds_format') || 'decimal');

  const handleOddsFormatChange = (e) => {
    const fmt = e.target.value;
    setOddsFormat(fmt);
    storageSet('oddsyra_odds_format', fmt);
    window.dispatchEvent(new CustomEvent('oddsformatchange', { detail: fmt }));
  };

  const moreRef = useRef(null);
  const walletRef = useRef(null);
  const notifRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const loyalty = getLoyaltySummary(user);
  const [sliderPoints, setSliderPoints] = useState(loyalty.points || 50);

  const isAdminPage = location.pathname.startsWith('/admin');
  const isDevRoute = location.pathname.startsWith('/developer') || location.pathname.startsWith('/api-docs');
  const isRegisterPage = location.pathname === '/register';
  const hasAdminSession = hasValidAdminSession();
  const unreadNotifCount = userNotifications.filter((n) => !n.is_read).length;

  useEffect(() => {
    if (loyalty.points > 0) {
      setSliderPoints((prev) => {
        if (prev > loyalty.points || prev < 50) return loyalty.points;
        return prev;
      });
    }
  }, [loyalty.points]);

  useEffect(() => {
    if (!isLoggedIn) {
      setUserNotifications([]);
      return undefined;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const res = await apiFetch('/api/v1/user/notifications');
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) {
          setUserNotifications(Array.isArray(data.notifications) ? data.notifications : []);
        }
      } catch {
        if (!cancelled) setUserNotifications([]);
      }
    };
    load();
    const timer = setInterval(load, 20000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isLoggedIn, user?.userId]);

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

  useEffect(() => {
    if (!isNotifOpen) return undefined;
    const close = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setIsNotifOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [isNotifOpen]);

  useEffect(() => {
    const openSpin = () => setIsSpinOpen(true);
    window.addEventListener('oddsyra:open-daily-spin', openSpin);
    return () => window.removeEventListener('oddsyra:open-daily-spin', openSpin);
  }, []);

  const togglePromos = useCallback(() => {
    setIsPromosOpen((open) => {
      if (!open) closeMyBets();
      return !open;
    });
  }, [closeMyBets]);

  const closePromos = useCallback(() => setIsPromosOpen(false), []);

  const handleMyBetsToggle = useCallback(() => {
    closePromos();
    setIsNotifOpen(false);
    toggleMyBets();
  }, [closePromos, toggleMyBets]);

  const handleNotifToggle = useCallback(() => {
    closePromos();
    closeMyBets();
    setIsNotifOpen((open) => !open);
  }, [closePromos, closeMyBets]);

  const handleOpenNotification = useCallback(async (notif) => {
    if (notif?.id && !notif.is_read) {
      try {
        await apiFetch('/api/v1/user/notifications/read', {
          method: 'POST',
          body: JSON.stringify({ notificationId: notif.id }),
        });
        setUserNotifications((prev) => prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n)));
      } catch {
        // ignore
      }
    }
    setIsNotifOpen(false);
    navigate('/profile?tab=support');
  }, [navigate]);

  const handleRedeemLoyalty = useCallback((pts) => {
    redeemLoyaltyPoints(pts);
  }, [redeemLoyaltyPoints]);

  if (isAdminPage) return null;

  const isAdminUser = ['admin', 'ADMIN', 'SUPER_ADMIN'].includes(user?.role)
    || user?.email === 'admin@oddsyra.com'
    || hasAdminSession;
  const showAdminCleanHeader = false;
  const wallet = getWalletBreakdown(user);

  const activeMoreLinks = moreLinks.filter((link) => {
    if (link.to === '/admin') return isAdminUser;
    if (link.to === '/profile') return isLoggedIn;
    return true;
  });

  const showOperatorChrome = isDevRoute && hasAdminSession && !isLoggedIn;

  return (
    <header className="header" id="main-header">
      <div className="header-inner">
        <div className="header-left">
          <button className="header-menu-btn" onClick={toggleSidebar} id="menu-toggle" aria-label="Menu">
            <HiOutlineMenu />
            <span className="menu-dot" />
          </button>

          <NavLink to="/" className="header-logo" id="header-logo">
            <BrandLogo size={36} className="logo-img" />
            <BrandWordmark className="logo-text" />
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
              <AnimatePresence>
                {isMoreOpen && (
                  <motion.div
                    className="header-more-menu"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                  >
                    {activeMoreLinks.map((link) => (
                      <button
                        key={link.to}
                        type="button"
                        className="header-more-item"
                        onClick={() => { navigate(link.to); setIsMoreOpen(false); }}
                      >
                        {link.label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </nav>
        </div>

        <div className="header-right">
          <ThemeToggle className="header-theme-toggle" />

          {showAdminCleanHeader ? (
            <div className="header-admin-clean-bar">
              {!isAdminPage && (
                <button className="header-deposit-btn" onClick={() => navigate('/admin')}>
                  Admin Portal
                </button>
              )}
            </div>
          ) : isLoggedIn ? (
            <>
              <motion.button
                type="button"
                className={`header-action-icon-btn header-my-bets-btn ${isMyBetsOpen ? 'active' : ''}`}
                data-my-bets-trigger
                onClick={handleMyBetsToggle}
                aria-expanded={isMyBetsOpen}
                aria-haspopup="dialog"
                aria-label="My bets"
                id="header-my-bets-btn"
                title="My Bets"
                whileHover={{ scale: hoverScale }}
                whileTap={{ scale: pressScale }}
                transition={springUi}
              >
                <HiOutlineClipboardList className="header-my-bets-icon" aria-hidden="true" />
                {myBetsCount > 0 && <span className="header-my-bets-badge">{myBetsCount}</span>}
              </motion.button>
              <div className="header-notif-wrap" ref={notifRef}>
                <motion.button
                  type="button"
                  className={`header-action-icon-btn ${isNotifOpen ? 'active' : ''}`}
                  onClick={handleNotifToggle}
                  aria-expanded={isNotifOpen}
                  aria-haspopup="dialog"
                  aria-label="Notifications"
                  title="Notifications"
                  whileHover={{ scale: hoverScale }}
                  whileTap={{ scale: pressScale }}
                  transition={springUi}
                >
                  <IoNotifications size={18} aria-hidden="true" />
                  {unreadNotifCount > 0 && <span className="header-my-bets-badge">{unreadNotifCount}</span>}
                </motion.button>
                <AnimatePresence>
                  {isNotifOpen && (
                    <motion.div
                      className="header-notif-menu"
                      role="dialog"
                      aria-label="Notifications"
                      initial={{ opacity: 0, y: 8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 4, scale: 0.96 }}
                      transition={{ duration: 0.15 }}
                    >
                      <div className="header-notif-menu__head">
                        <strong>Notifications</strong>
                        <button
                          type="button"
                          onClick={() => {
                            setIsNotifOpen(false);
                            navigate('/profile?tab=support');
                          }}
                        >
                          Support
                        </button>
                      </div>
                      <div className="header-notif-menu__list">
                        {userNotifications.length === 0 ? (
                          <p className="header-notif-empty">No notifications yet</p>
                        ) : (
                          userNotifications.slice(0, 12).map((notif) => (
                            <button
                              key={notif.id}
                              type="button"
                              className={`header-notif-item ${notif.is_read ? '' : 'unread'}`}
                              onClick={() => handleOpenNotification(notif)}
                            >
                              <span className="header-notif-item__title">{notif.subject || notif.event_type}</span>
                              <span className="header-notif-item__body">{notif.body}</span>
                            </button>
                          ))
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <motion.button
                type="button"
                className="header-action-icon-btn header-spin-icon-btn"
                id="daily-spin-btn"
                title="Spin & Win Daily Rewards"
                onClick={() => setIsSpinOpen(true)}
                whileHover={{ scale: hoverScale }}
                whileTap={{ scale: pressScale }}
                transition={springUi}
              >
                <motion.div
                  animate={{ scale: [1, 1.25, 1], rotate: [0, -10, 10, 0] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  style={{ display: 'inline-flex' }}
                >
                  <FiZap style={{ color: '#f59e0b' }} />
                </motion.div>
              </motion.button>
              <motion.button
                type="button"
                className={`header-action-icon-btn ${isPromosOpen ? 'active' : ''}`}
                id="bonuses-btn"
                data-promos-trigger
                aria-label="Promotions"
                aria-expanded={isPromosOpen}
                aria-haspopup="dialog"
                onClick={togglePromos}
                title="Promotions"
                whileHover={{ scale: hoverScale }}
                whileTap={{ scale: pressScale }}
                transition={springUi}
              >
                <AnimatedMotionGiftIcon size={18} />
              </motion.button>
              <motion.button
                type="button"
                className={`header-action-icon-btn ${location.pathname.startsWith('/profile') ? 'active' : ''}`}
                id="header-profile-btn"
                aria-label="My Profile"
                title="My Profile"
                onClick={() => navigate('/profile')}
                whileHover={{ scale: hoverScale }}
                whileTap={{ scale: pressScale }}
                transition={springUi}
              >
                <HiOutlineUser className="header-profile-icon" aria-hidden="true" />
              </motion.button>
            </>
          ) : null}

          {isAdminUser && (
            <select
              className="header-odds-format-select"
              value={oddsFormat}
              onChange={handleOddsFormatChange}
              title="Odds Format Engine (Admin)"
            >
              {ODDS_FORMAT_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}

          {isLoggedIn && !isAdminPage ? (
            <>
              <div className="header-wallet-group" ref={walletRef}>
                <div className="header-wallet-dropdown-wrap">
                  <button
                    type="button"
                    className={`header-balance ${isWalletOpen ? 'active' : ''}`}
                    id="header-balance"
                    onClick={() => setIsWalletOpen((open) => !open)}
                    aria-expanded={isWalletOpen}
                    aria-haspopup="true"
                  >
                    <span className="balance-amount-text">
                      <RupeeSymbol size={20} />
                      {Number(wallet.total).toLocaleString('en-IN', {
                        minimumFractionDigits: wallet.total % 1 !== 0 ? 2 : 0,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                    <FiChevronDown className={`balance-chevron ${isWalletOpen ? 'open' : ''}`} />
                  </button>
                  <AnimatePresence>
                    {isWalletOpen && (
                      <motion.div
                        className="header-wallet-menu"
                        role="menu"
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.18, ease: 'easeOut' }}
                      >
                      <div className="header-wallet-menu__loyalty">
                        <div className="header-wallet-menu__loyalty-head">
                          <span className="header-wallet-menu__loyalty-title">
                            <span className="header-loyalty-icon" aria-hidden="true">⭐</span>
                            Loyalty points
                          </span>
                          <span className="header-wallet-menu__loyalty-points">{loyalty.points}</span>
                        </div>
                        <p className="header-wallet-menu__loyalty-hint">
                          Earn 5 pts per ₹100 spent · 5 pts = ₹1
                        </p>
                        <div className="header-wallet-menu__loyalty-progress" aria-hidden="true">
                          <div
                            className="header-wallet-menu__loyalty-progress-bar"
                            style={{ width: `${loyalty.progress}%` }}
                          />
                        </div>
                        <p className="header-wallet-menu__loyalty-meta">
                          {loyalty.canRedeem
                            ? `Redeem for cash (${loyalty.pointsPer100} pts / ₹100 · 5 pts = ₹1)`
                            : `${loyalty.pointsToUnlock} pts to unlock redemption (${LOYALTY_MIN_REDEEM_POINTS} pts min)`}
                        </p>
                        {loyalty.canRedeem && (
                          <div className="loyalty-slider-section">
                            <div className="loyalty-slider-header">
                              <span className="loyalty-slider-label">Redeem amount:</span>
                              <span className="loyalty-slider-value">
                                <strong>{sliderPoints} pts</strong>
                                <span className="loyalty-slider-rupees">(= ₹{(sliderPoints / 5).toFixed(2)})</span>
                              </span>
                            </div>

                            <input
                              type="range"
                              min={Math.min(LOYALTY_MIN_REDEEM_POINTS, loyalty.points)}
                              max={loyalty.points}
                              step={5}
                              value={sliderPoints}
                              onChange={(e) => setSliderPoints(Number(e.target.value))}
                              className="loyalty-range-input"
                              id="loyalty-points-slider"
                            />

                            <div className="loyalty-slider-limits">
                              <span>50 pts (₹10)</span>
                              <span>{loyalty.points} pts (₹{(loyalty.points / 5).toFixed(2)})</span>
                            </div>

                            <div className="loyalty-slider-presets">
                              {[0.25, 0.5, 0.75, 1].map((pct) => {
                                const targetPts = Math.max(50, Math.floor((loyalty.points * pct) / 5) * 5);
                                return (
                                  <button
                                    key={pct}
                                    type="button"
                                    className={`loyalty-preset-chip ${sliderPoints === targetPts ? 'active' : ''}`}
                                    onClick={() => setSliderPoints(targetPts)}
                                  >
                                    {pct === 1 ? 'Max' : `${pct * 100}%`}
                                  </button>
                                );
                              })}
                            </div>

                            <button
                              type="button"
                              className="header-wallet-menu__redeem header-wallet-menu__redeem--slider"
                              onClick={() => handleRedeemLoyalty(sliderPoints)}
                            >
                              Redeem {sliderPoints} pts (₹{(sliderPoints / 5).toFixed(2)})
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="header-wallet-menu__divider" />

                      <div className="header-wallet-menu__row">
                        <span className="header-wallet-menu__label">Cash Balance</span>
                        <span className="header-wallet-menu__value">{formatInr(wallet.cashBalance)}</span>
                      </div>
                      <div className="header-wallet-menu__row">
                        <span className="header-wallet-menu__label flex-center gap-1">
                          <AnimatedMotionGiftIcon size={13} /> Bonus Wallet
                        </span>
                        <span className="header-wallet-menu__value header-wallet-menu__value--bonus">
                          {formatInr(wallet.bonus)}
                        </span>
                      </div>
                      <div className="header-wallet-menu__row">
                        <span className="header-wallet-menu__label flex-center gap-1">
                          <FiZap size={13} style={{ color: '#0284c7' }} /> Freebet Vouchers
                        </span>
                        <span className="header-wallet-menu__value header-wallet-menu__value--freebet">
                          {formatInr(wallet.freebets)}
                        </span>
                      </div>
                      {wallet.lockedDeposit > 0 && (
                        <div className="header-wallet-menu__row">
                          <span className="header-wallet-menu__label">Deposited (locked)</span>
                          <span className="header-wallet-menu__value header-wallet-menu__value--locked">
                            {formatInr(wallet.lockedDeposit)}
                          </span>
                        </div>
                      )}

                      <div className="header-wallet-menu__divider" />

                      <div className="header-wallet-menu__row">
                        <span className="header-wallet-menu__label">Winnings</span>
                        <span className="header-wallet-menu__value header-wallet-menu__value--winnings">
                          {formatInr(wallet.winnings)}
                        </span>
                      </div>
                      <div className="header-wallet-menu__row header-wallet-menu__row--highlight">
                        <span className="header-wallet-menu__label">Withdrawable</span>
                        <span className="header-wallet-menu__value">{formatInr(wallet.withdrawable)}</span>
                      </div>
                      <div className="header-wallet-menu__actions">
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
                        <button
                          type="button"
                          className="header-wallet-menu__withdraw"
                          onClick={() => {
                            setIsWalletOpen(false);
                            openFinModal('withdraw');
                          }}
                        >
                          Withdraw
                        </button>
                        <button
                          type="button"
                          className="header-wallet-menu__profile"
                          onClick={() => {
                            setIsWalletOpen(false);
                            navigate('/profile');
                          }}
                        >
                          My Profile
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                </div>
              </div>
            </>
          ) : showOperatorChrome ? (
            <button
              type="button"
              className="header-login-btn"
              onClick={() => navigate('/admin')}
            >
              Back to Admin
            </button>
          ) : (
            <div className="header-auth-buttons">
              <button className="header-login-btn" onClick={openLoginModal} id="login-btn">
                Log in
              </button>
              {!isRegisterPage && (
                <button className="header-join-btn" onClick={() => navigate('/register')} id="join-btn">
                  <span className="header-join-label-full">Join now</span>
                  <span className="header-join-label-short">Join</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {isLoggedIn && <MyBetsPanel />}
      {isLoggedIn && <PromotionsPanel isOpen={isPromosOpen} onClose={closePromos} />}
      {isLoggedIn && <DailySpinModal isOpen={isSpinOpen} onClose={() => setIsSpinOpen(false)} />}
    </header>
  );
}

export default memo(Header);
