import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { CASINO_ENABLED } from '../../utils/featureFlags';
import { hoverScale, pressScale, springUi } from '../../utils/motionPresets';
import {
  IoClose,
  FiChevronRight,
  HiOutlineDocumentText,
  HiOutlineUser,
  HiOutlineTrophy,
  BiWallet,
  BiMoneyWithdraw,
  BiHistory,
  BiTransfer,
  BiGift,
  MdOutlineCancel,
  MdOutlineStorefront,
  RiLogoutBoxRLine,
  IoNotifications,
  FiZap,
  HiOutlineClipboardList,
  FiShield,
  FiHelpCircle,
} from '../../icons';
import { useAuth } from '../../context/AuthContext';
import { isAdminEligibleUser } from '../../utils/isAdminEligibleUser';
import { useBetSlip } from '../../context/BetSlipContext';
import { getLoyaltySummary } from '../../utils/loyaltyPoints';
import { useUserNotifications } from '../../hooks/useUserNotifications';
import ThemeToggle from '../ThemeToggle/ThemeToggle';
import './Sidebar.css';

function formatNotifTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function Sidebar() {
  const location = useLocation();
  const {
    user, isLoggedIn, isSidebarOpen, closeSidebar, logout,
    openLoginModal, openDepositModal, openFinModal,
  } = useAuth();
  const { openMyBets } = useBetSlip();
  const navigate = useNavigate();
  const isAdminPage = location.pathname.startsWith('/admin');
  const isDevRoute = location.pathname.startsWith('/developer') || location.pathname.startsWith('/api-docs');
  const { notifications, unreadCount, refresh, markRead, markAllRead, clearNotification, clearAll } = useUserNotifications(isLoggedIn, user?.userId);
  const [notifsExpanded, setNotifsExpanded] = useState(false);

  useEffect(() => {
    closeSidebar();
  }, [location.pathname, closeSidebar]);

  useEffect(() => {
    if (isSidebarOpen && isLoggedIn) {
      refresh();
    }
    if (!isSidebarOpen) {
      setNotifsExpanded(false);
    }
  }, [isSidebarOpen, isLoggedIn, refresh]);

  if (isAdminPage || isDevRoute) return null;

  const handleLogin = () => {
    closeSidebar();
    openLoginModal();
  };

  const handleRegister = () => {
    closeSidebar();
    navigate('/register');
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleFinModal = (type) => {
    closeSidebar();
    openFinModal(type);
  };

  const handleOpenNotification = async (notif) => {
    if (notif?.id && !notif.is_read) {
      await markRead(notif.id);
    }
    closeSidebar();
    navigate('/support');
  };

  const firstName = String(user?.displayName || user?.email || 'there').split(/[\s@]/)[0];
  const loyalty = getLoyaltySummary(user);
  const isAdminUser = isLoggedIn && isAdminEligibleUser(user);

  return (
    <>
      <div className={`sidebar-overlay ${isSidebarOpen ? 'open' : ''}`} onClick={closeSidebar} />
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`} id="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-header-text">
            <span className="sidebar-header-title">
              {isLoggedIn ? `Hi, ${firstName}` : 'Menu'}
            </span>
            {isLoggedIn && (
              <span className="sidebar-header-sub">
                {loyalty.tierLabel || user?.loyaltyRank || 'Standard'}
                {loyalty.points > 0 ? ` · ${Number(loyalty.points).toLocaleString('en-IN')} pts` : ''}
              </span>
            )}
          </div>
          <motion.button
            className="sidebar-close"
            onClick={closeSidebar}
            id="sidebar-close"
            aria-label="Close menu"
            whileHover={{ scale: hoverScale }}
            whileTap={{ scale: pressScale }}
            transition={springUi}
          >
            <IoClose />
          </motion.button>
        </div>

        {isLoggedIn ? (
          <>
            <div className="sidebar-content">
              <section className="sidebar-notif-panel">
                <button
                  type="button"
                  className={`sidebar-notif-toggle ${notifsExpanded ? 'open' : ''}`}
                  onClick={() => setNotifsExpanded((v) => !v)}
                  aria-expanded={notifsExpanded}
                >
                  <span className="sidebar-notif-toggle__icon">
                    <IoNotifications />
                    {unreadCount > 0 && (
                      <span className="sidebar-notif-toggle__dot" aria-hidden />
                    )}
                  </span>
                  <span className="sidebar-notif-toggle__copy">
                    <strong>Notifications</strong>
                    <span>
                      {unreadCount > 0
                        ? `${unreadCount} unread`
                        : (notifications.length ? 'You\'re all caught up' : 'No notifications yet')}
                    </span>
                  </span>
                  {unreadCount > 0 && (
                    <span className="sidebar-notif-count">{unreadCount > 99 ? '99+' : unreadCount}</span>
                  )}
                  <FiChevronRight className={`sidebar-notif-chevron ${notifsExpanded ? 'open' : ''}`} />
                </button>

                <AnimatePresence initial={false}>
                  {notifsExpanded && (
                    <motion.div
                      className="sidebar-notif-list"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
                    >
                      {notifications.length > 0 && (
                        <div className="sidebar-notif-toolbar">
                          {unreadCount > 0 && (
                            <button type="button" onClick={() => markAllRead()}>
                              Mark all read
                            </button>
                          )}
                          <button type="button" className="sidebar-notif-toolbar__clear" onClick={() => clearAll()}>
                            Clear all
                          </button>
                        </div>
                      )}
                      {notifications.length === 0 ? (
                        <p className="sidebar-notif-empty">Nothing here yet. Bet updates and support replies will show up here.</p>
                      ) : (
                        notifications.slice(0, 10).map((notif) => (
                          <div
                            key={notif.id}
                            className={`sidebar-notif-item ${notif.is_read ? '' : 'unread'}`}
                          >
                            <button
                              type="button"
                              className="sidebar-notif-item__main"
                              onClick={() => handleOpenNotification(notif)}
                            >
                              <span className="sidebar-notif-item__title">
                                {notif.subject || notif.event_type || 'Update'}
                              </span>
                              {notif.body && (
                                <span className="sidebar-notif-item__body">{notif.body}</span>
                              )}
                              <span className="sidebar-notif-item__time">{formatNotifTime(notif.created_at)}</span>
                            </button>
                            <button
                              type="button"
                              className="sidebar-notif-item__dismiss"
                              aria-label="Clear notification"
                              onClick={() => clearNotification(notif.id)}
                            >
                              ×
                            </button>
                          </div>
                        ))
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>

              <div className="sidebar-money-row">
                <button
                  type="button"
                  className="sidebar-money-btn sidebar-money-btn--deposit"
                  onClick={() => { closeSidebar(); openDepositModal(); }}
                >
                  <BiWallet />
                  Deposit
                </button>
                <button
                  type="button"
                  className="sidebar-money-btn sidebar-money-btn--withdraw"
                  onClick={() => handleFinModal('withdraw')}
                >
                  <BiMoneyWithdraw />
                  Withdraw
                </button>
              </div>

              <div className="sidebar-section-label">Sports & Betting</div>
              <div className="sidebar-list">
                <button type="button" className="sidebar-list-item" onClick={() => { closeSidebar(); navigate('/sports'); }}>
                  <HiOutlineTrophy className="sidebar-list-icon" />
                  <span>Sportsbook</span>
                  <FiChevronRight className="sidebar-list-arrow" />
                </button>
                <button type="button" className="sidebar-list-item" onClick={() => { closeSidebar(); navigate('/live-betting'); }}>
                  <FiZap className="sidebar-list-icon" />
                  <span>Live Betting</span>
                  <FiChevronRight className="sidebar-list-arrow" />
                </button>
                <button type="button" className="sidebar-list-item" onClick={() => { closeSidebar(); openMyBets(); }}>
                  <HiOutlineClipboardList className="sidebar-list-icon" />
                  <span>My Bets</span>
                  <FiChevronRight className="sidebar-list-arrow" />
                </button>
                <button type="button" className="sidebar-list-item" onClick={() => handleFinModal('bets-history')}>
                  <BiHistory className="sidebar-list-icon" />
                  <span>Bet history</span>
                  <FiChevronRight className="sidebar-list-arrow" />
                </button>
                <button type="button" className="sidebar-list-item" onClick={() => handleFinModal('transactions')}>
                  <BiTransfer className="sidebar-list-icon" />
                  <span>Transactions</span>
                  <FiChevronRight className="sidebar-list-arrow" />
                </button>
                <button type="button" className="sidebar-list-item" onClick={() => handleFinModal('bonuses')}>
                  <BiGift className="sidebar-list-icon" />
                  <span>Bonuses & Free Bets</span>
                  <FiChevronRight className="sidebar-list-arrow" />
                </button>
                <button
                  type="button"
                  className="sidebar-list-item"
                  onClick={() => {
                    closeSidebar();
                    window.dispatchEvent(new Event('oddsyra:open-daily-spin'));
                  }}
                >
                  <FiZap className="sidebar-list-icon" />
                  <span>Daily spin</span>
                  <FiChevronRight className="sidebar-list-arrow" />
                </button>
                <button type="button" className="sidebar-list-item" onClick={() => handleFinModal('cancel-wd')}>
                  <MdOutlineCancel className="sidebar-list-icon" />
                  <span>Cancel withdrawal</span>
                  <FiChevronRight className="sidebar-list-arrow" />
                </button>
              </div>

              <div className="sidebar-section-label">Explore</div>
              <div className="sidebar-list">
                <button type="button" className="sidebar-list-item" onClick={() => { closeSidebar(); navigate('/profile'); }}>
                  <HiOutlineUser className="sidebar-list-icon" />
                  <span>Profile</span>
                  <FiChevronRight className="sidebar-list-arrow" />
                </button>
                <button type="button" className="sidebar-list-item" onClick={() => { closeSidebar(); navigate('/notifications'); }}>
                  <IoNotifications className="sidebar-list-icon" />
                  <span>Notifications{unreadCount > 0 ? ` (${unreadCount > 99 ? '99+' : unreadCount})` : ''}</span>
                  <FiChevronRight className="sidebar-list-arrow" />
                </button>
                <button type="button" className="sidebar-list-item" onClick={() => { closeSidebar(); navigate('/support'); }}>
                  <FiHelpCircle className="sidebar-list-icon" />
                  <span>Support Desk</span>
                  <FiChevronRight className="sidebar-list-arrow" />
                </button>
                <button type="button" className="sidebar-list-item" onClick={() => { closeSidebar(); navigate('/promotions'); }}>
                  <HiOutlineTrophy className="sidebar-list-icon" />
                  <span>Promotions</span>
                  <FiChevronRight className="sidebar-list-arrow" />
                </button>
                <button type="button" className="sidebar-list-item" onClick={() => { closeSidebar(); navigate('/vip'); }}>
                  <FiShield className="sidebar-list-icon" />
                  <span>VIP Club</span>
                  <FiChevronRight className="sidebar-list-arrow" />
                </button>
                {CASINO_ENABLED && (
                  <button type="button" className="sidebar-list-item" onClick={() => { closeSidebar(); navigate('/casino'); }}>
                    <MdOutlineStorefront className="sidebar-list-icon" />
                    <span>Casino</span>
                    <FiChevronRight className="sidebar-list-arrow" />
                  </button>
                )}
                {isAdminUser && (
                  <button type="button" className="sidebar-list-item" onClick={() => { closeSidebar(); navigate('/admin'); }}>
                    <FiShield className="sidebar-list-icon" />
                    <span>Admin portal</span>
                    <FiChevronRight className="sidebar-list-arrow" />
                  </button>
                )}
              </div>
            </div>

            <div className="sidebar-theme">
              <ThemeToggle variant="sidebar" />
            </div>

            <div className="sidebar-logout">
              <button className="sidebar-logout-btn" onClick={handleLogout} id="logout-btn">
                <RiLogoutBoxRLine className="logout-icon" />
                Log out
                <FiChevronRight className="logout-arrow" />
              </button>
            </div>
          </>
        ) : (
          <div className="sidebar-guest">
            <div className="sidebar-guest-mark">
              <HiOutlineDocumentText />
            </div>
            <h3>ODDSYRA</h3>
            <p>Platform is undergoing updates and verification. Access is temporarily limited to authorized accounts.</p>
            <button type="button" className="sidebar-guest-btn primary" onClick={handleLogin}>Log In</button>
            <div className="sidebar-list sidebar-list--guest">
              <button type="button" className="sidebar-list-item" onClick={() => { closeSidebar(); navigate('/'); }}>
                <HiOutlineTrophy className="sidebar-list-icon" />
                <span>Home</span>
                <FiChevronRight className="sidebar-list-arrow" />
              </button>
              <button type="button" className="sidebar-list-item" onClick={() => { closeSidebar(); navigate('/help'); }}>
                <FiHelpCircle className="sidebar-list-icon" />
                <span>Support Desk</span>
                <FiChevronRight className="sidebar-list-arrow" />
              </button>
              <button type="button" className="sidebar-list-item" onClick={() => { closeSidebar(); navigate('/privacy'); }}>
                <FiShield className="sidebar-list-icon" />
                <span>Privacy Policy</span>
                <FiChevronRight className="sidebar-list-arrow" />
              </button>
              <button type="button" className="sidebar-list-item" onClick={() => { closeSidebar(); navigate('/terms'); }}>
                <HiOutlineDocumentText className="sidebar-list-icon" />
                <span>Terms of Service</span>
                <FiChevronRight className="sidebar-list-arrow" />
              </button>
            </div>
            <div className="sidebar-theme sidebar-theme--guest">
              <ThemeToggle variant="sidebar" />
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
