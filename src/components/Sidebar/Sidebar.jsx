import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  IoClose,
  FiChevronRight,
  HiOutlineDocumentText,
  HiOutlineUser,
  HiOutlineTrophy,
  HiOutlineCube,
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
} from '../../icons';
import { useAuth } from '../../context/AuthContext';
import { useBetSlip } from '../../context/BetSlipContext';
import ThemeToggle from '../ThemeToggle/ThemeToggle';
import './Sidebar.css';

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

  return (
    <>
      <div className={`sidebar-overlay ${isSidebarOpen ? 'open' : ''}`} onClick={closeSidebar} />
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`} id="sidebar">
        <div className="sidebar-header">
          <span style={{ fontWeight: 700, fontSize: 'var(--text-lg)' }}>
            {isLoggedIn ? `Hi, ${user.displayName.split(' ')[0]}` : 'Menu'}
          </span>
          <motion.button
            className="sidebar-close"
            onClick={closeSidebar}
            id="sidebar-close"
            whileHover={{ scale: 1.15, rotate: 90 }}
            whileTap={{ scale: 0.85 }}
          >
            <IoClose />
          </motion.button>
        </div>

        {isLoggedIn ? (
          <>
            {/* Top Navigation Tabs */}
            <div className="sidebar-tabs">
              <button className="sidebar-tab active">
                <HiOutlineDocumentText className="tab-icon" />
                Account
              </button>
              {(user?.role === 'admin' || user?.email === 'admin@oddsyra.com') && (
                <button className="sidebar-tab" onClick={() => { closeSidebar(); navigate('/admin'); }}>
                  <HiOutlineDocumentText className="tab-icon" />
                  Admin
                </button>
              )}
              <button className="sidebar-tab" onClick={() => { closeSidebar(); navigate('/profile'); }}>
                <HiOutlineUser className="tab-icon" />
                Profile
              </button>
              <button className="sidebar-tab sidebar-tab--page-nav" onClick={() => { closeSidebar(); navigate('/sports'); }}>
                <HiOutlineTrophy className="tab-icon" />
                Sports
              </button>
              <button className="sidebar-tab sidebar-tab--page-nav" onClick={() => { closeSidebar(); navigate('/live-betting'); }}>
                <HiOutlineCube className="tab-icon" />
                Live
              </button>
              <button className="sidebar-tab sidebar-tab--page-nav" onClick={() => { closeSidebar(); navigate('/casino'); }}>
                <MdOutlineStorefront className="tab-icon" />
                Casino
              </button>
            </div>

            <div className="sidebar-content">
              {/* Wicket Keeper Level Badge */}
              <div className="sidebar-loyalty">
                <HiOutlineTrophy className="loyalty-avatar-icon" aria-hidden />
                <div className="loyalty-info">
                  <h4>{user.loyaltyRank}</h4>
                  <p>Level {user.loyaltyLevel} · {user.xpToNext.toLocaleString()} XP to Level {user.loyaltyLevel + 1}</p>
                </div>
                <div className="loyalty-ring" />
              </div>

              {/* Notifications */}
              <div className="sidebar-notifications" onClick={() => handleFinModal('transactions')}>
                <IoNotifications className="notif-icon" />
                <div className="notif-info">
                  <h4>Notifications center</h4>
                  <p>Updates will appear here</p>
                </div>
                <span className="notif-badge">{user.notifications}</span>
                <FiChevronRight className="notif-arrow" />
              </div>

              {/* Actions Grid */}
              <div className="sidebar-actions">
                <div className="sidebar-actions-row">
                  <button className="sidebar-action" onClick={() => { closeSidebar(); openDepositModal(); }}>
                    <span className="action-icon-wrap"><BiWallet className="action-icon" /></span>
                    <span className="action-label">Deposit</span>
                  </button>

                  <button className="sidebar-action" onClick={() => handleFinModal('withdraw')}>
                    <span className="action-icon-wrap"><BiMoneyWithdraw className="action-icon" /></span>
                    <span className="action-label">Withdraw</span>
                  </button>

                  <button className="sidebar-action" onClick={() => handleFinModal('cancel-wd')} title="Cancel withdrawal">
                    <span className="action-icon-wrap"><MdOutlineCancel className="action-icon" /></span>
                    <span className="action-label">Cancel WD</span>
                  </button>

                  <button className="sidebar-action" onClick={() => { closeSidebar(); openMyBets(); }}>
                    <span className="action-icon-wrap"><HiOutlineDocumentText className="action-icon" /></span>
                    <span className="action-label">My Bets</span>
                  </button>
                </div>

                <div className="sidebar-actions-row">
                  <button className="sidebar-action" onClick={() => handleFinModal('bets-history')} title="Bets history">
                    <span className="action-icon-wrap"><BiHistory className="action-icon" /></span>
                    <span className="action-label">History</span>
                  </button>

                  <button className="sidebar-action" onClick={() => handleFinModal('transactions')} title="Transactions">
                    <span className="action-icon-wrap"><BiTransfer className="action-icon" /></span>
                    <span className="action-label">Activity</span>
                  </button>

                  <button className="sidebar-action" onClick={() => handleFinModal('bonuses')} title="My bonuses">
                    <span className="action-icon-wrap"><BiGift className="action-icon" /></span>
                    <span className="action-label">Bonuses</span>
                  </button>

                  <button
                    className="sidebar-action"
                    onClick={() => {
                      closeSidebar();
                      window.dispatchEvent(new Event('oddsyra:open-daily-spin'));
                    }}
                    title="Daily spin"
                  >
                    <span className="action-icon-wrap"><FiZap className="action-icon" /></span>
                    <span className="action-label">Spin</span>
                  </button>
                </div>
              </div>

              {/* Marketplace Link */}
              <button className="sidebar-link" onClick={() => handleFinModal('marketplace')}>
                <span className="link-left">
                  <MdOutlineStorefront className="link-icon" />
                  Marketplace
                </span>
                <FiChevronRight className="link-arrow" />
              </button>

              {/* Loyalty Benefits Link */}
              <button className="sidebar-link" onClick={() => handleFinModal('bonuses')}>
                <span className="link-left">
                  <HiOutlineTrophy className="link-icon" />
                  Discover Loyalty Benefits
                </span>
                <FiChevronRight className="link-arrow" />
              </button>
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
            <h3>Welcome to OddsYra!</h3>
            <p>Log in or create an account to start betting</p>
            <button className="sidebar-guest-btn primary" onClick={handleLogin}>Log in</button>
            <button className="sidebar-guest-btn outline" onClick={handleRegister}>Create Account</button>
            <div className="sidebar-theme sidebar-theme--guest">
              <ThemeToggle variant="sidebar" />
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
