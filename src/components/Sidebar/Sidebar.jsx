import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
} from '../../icons';
import { useAuth } from '../../context/AuthContext';
import { useBetSlip } from '../../context/BetSlipContext';
import { useTheme } from '../../context/ThemeContext';
import { HiOutlineMoon, HiOutlineSun } from '../../icons';
import FinancialModals from '../FinancialModals/FinancialModals';
import './Sidebar.css';

export default function Sidebar() {
  const { user, isLoggedIn, isSidebarOpen, closeSidebar, logout, openLoginModal, openDepositModal } = useAuth();
  const { openMyBets } = useBetSlip();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [activeFinModal, setActiveFinModal] = useState(null);

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

  const openFinModal = (type) => {
    setActiveFinModal(type);
  };

  return (
    <>
      <div className={`sidebar-overlay ${isSidebarOpen ? 'open' : ''}`} onClick={closeSidebar} />
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`} id="sidebar">
        <div className="sidebar-header">
          <span style={{ fontWeight: 700, fontSize: 'var(--text-lg)' }}>
            {isLoggedIn ? `Hi, ${user.displayName.split(' ')[0]}` : 'Menu'}
          </span>
          <button className="sidebar-close" onClick={closeSidebar} id="sidebar-close">
            <IoClose />
          </button>
        </div>

        {isLoggedIn ? (
          <>
            {/* Top Navigation Tabs */}
            <div className="sidebar-tabs">
              <button className="sidebar-tab active">
                <HiOutlineDocumentText className="tab-icon" />
                Account
              </button>
              <button className="sidebar-tab" onClick={() => { closeSidebar(); navigate('/profile'); }}>
                <HiOutlineUser className="tab-icon" />
                Profile
              </button>
              <button className="sidebar-tab" onClick={() => { closeSidebar(); navigate('/sports'); }}>
                <HiOutlineTrophy className="tab-icon" />
                Sports
              </button>
              <button className="sidebar-tab" onClick={() => { closeSidebar(); navigate('/live-betting'); }}>
                <HiOutlineCube className="tab-icon" />
                Live
              </button>
            </div>

            <div className="sidebar-content">
              {/* Wicket Keeper Level Badge */}
              <div className="sidebar-loyalty">
                <div className="loyalty-avatar">🏏</div>
                <div className="loyalty-info">
                  <h4>{user.loyaltyRank}</h4>
                  <p>Level {user.loyaltyLevel} · {user.xpToNext.toLocaleString()} XP to Level {user.loyaltyLevel + 1}</p>
                </div>
                <div className="loyalty-ring" />
              </div>

              {/* Notifications */}
              <div className="sidebar-notifications" onClick={() => openFinModal('transactions')}>
                <div className="notif-icon">🔔</div>
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

                  <button className="sidebar-action" onClick={() => openFinModal('withdraw')}>
                    <span className="action-icon-wrap"><BiMoneyWithdraw className="action-icon" /></span>
                    <span className="action-label">Withdraw</span>
                  </button>

                  <button className="sidebar-action" onClick={() => openFinModal('cancel-wd')}>
                    <span className="action-icon-wrap"><MdOutlineCancel className="action-icon" /></span>
                    <span className="action-label">Cancel W/D</span>
                  </button>

                  <button className="sidebar-action" onClick={() => { closeSidebar(); openMyBets(); }}>
                    <span className="action-icon-wrap"><HiOutlineDocumentText className="action-icon" /></span>
                    <span className="action-label">My Bets</span>
                  </button>
                </div>

                <div className="sidebar-actions-row sidebar-actions-row--three">
                  <button className="sidebar-action" onClick={() => openFinModal('bets-history')}>
                    <span className="action-icon-wrap"><BiHistory className="action-icon" /></span>
                    <span className="action-label">Bets History</span>
                  </button>

                  <button className="sidebar-action" onClick={() => openFinModal('transactions')}>
                    <span className="action-icon-wrap"><BiTransfer className="action-icon" /></span>
                    <span className="action-label">Transactions</span>
                  </button>

                  <button className="sidebar-action" onClick={() => openFinModal('bonuses')}>
                    <span className="action-icon-wrap"><BiGift className="action-icon" /></span>
                    <span className="action-label">My Bonuses</span>
                  </button>
                </div>
              </div>

              {/* Marketplace Link */}
              <button className="sidebar-link" onClick={() => openFinModal('marketplace')}>
                <span className="link-left">
                  <MdOutlineStorefront className="link-icon" />
                  Marketplace
                </span>
                <FiChevronRight className="link-arrow" />
              </button>

              {/* Loyalty Benefits Link */}
              <button className="sidebar-link" onClick={() => openFinModal('bonuses')}>
                <span className="link-left">
                  <HiOutlineTrophy className="link-icon" />
                  Discover Loyalty Benefits
                </span>
                <FiChevronRight className="link-arrow" />
              </button>
            </div>

            <div className="sidebar-theme">
              <button type="button" className="sidebar-theme-btn" onClick={toggleTheme}>
                {theme === 'dark' ? <HiOutlineSun /> : <HiOutlineMoon />}
                <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
              </button>
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
            <h3>Welcome to BetKing!</h3>
            <p>Log in or create an account to start betting</p>
            <button className="sidebar-guest-btn primary" onClick={handleLogin}>Log in</button>
            <button className="sidebar-guest-btn outline" onClick={handleRegister}>Create Account</button>
            <button type="button" className="sidebar-theme-btn guest" onClick={toggleTheme}>
              {theme === 'dark' ? <HiOutlineSun /> : <HiOutlineMoon />}
              <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
            </button>
          </div>
        )}
      </aside>

      {/* Financial Modals for Withdrawals, Cancel W/D, Transactions, History, Bonuses, Marketplace */}
      <FinancialModals modalType={activeFinModal} onClose={() => setActiveFinModal(null)} />
    </>
  );
}
