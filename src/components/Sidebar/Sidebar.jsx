import { useNavigate } from 'react-router-dom';
import { IoClose } from 'react-icons/io5';
import { FiChevronRight } from 'react-icons/fi';
import { HiOutlineDocumentText, HiOutlineUser, HiOutlineTrophy, HiOutlineCube } from 'react-icons/hi2';
import { BiWallet, BiMoneyWithdraw, BiHistory, BiTransfer, BiGift, BiBell } from 'react-icons/bi';
import { MdOutlineCancel, MdOutlineStorefront } from 'react-icons/md';
import { RiLogoutBoxRLine } from 'react-icons/ri';
import { useAuth } from '../../context/AuthContext';
import './Sidebar.css';

export default function Sidebar() {
  const { user, isLoggedIn, isSidebarOpen, closeSidebar, logout, openLoginModal, openDepositModal } = useAuth();
  const navigate = useNavigate();

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
            <div className="sidebar-tabs">
              <button className="sidebar-tab active">
                <HiOutlineDocumentText className="tab-icon" />
                Account
              </button>
              <button className="sidebar-tab">
                <HiOutlineUser className="tab-icon" />
                Profile
              </button>
              <button className="sidebar-tab">
                <HiOutlineTrophy className="tab-icon" />
                Sports
              </button>
              <button className="sidebar-tab">
                <HiOutlineCube className="tab-icon" />
                Casino
              </button>
            </div>

            <div className="sidebar-content">
              <div className="sidebar-loyalty">
                <div className="loyalty-avatar">🏏</div>
                <div className="loyalty-info">
                  <h4>{user.loyaltyRank}</h4>
                  <p>Level {user.loyaltyLevel} · {user.xpToNext.toLocaleString()} XP to Level {user.loyaltyLevel + 1}</p>
                </div>
                <div className="loyalty-ring" />
              </div>

              <div className="sidebar-notifications">
                <div className="notif-icon">🔔</div>
                <div className="notif-info">
                  <h4>Notifications center</h4>
                  <p>Updates will appear here</p>
                </div>
                <span className="notif-badge">{user.notifications}</span>
                <FiChevronRight className="notif-arrow" />
              </div>

              <div className="sidebar-actions">
                <button className="sidebar-action" onClick={openDepositModal}>
                  <BiWallet className="action-icon" />
                  Deposit
                </button>
                <button className="sidebar-action">
                  <BiMoneyWithdraw className="action-icon" />
                  Withdraw
                </button>
                <button className="sidebar-action">
                  <MdOutlineCancel className="action-icon" />
                  Cancel W/D
                </button>
                <button className="sidebar-action" onClick={() => { closeSidebar(); navigate('/sports'); }}>
                  <HiOutlineDocumentText className="action-icon" />
                  My Bets
                </button>
                <button className="sidebar-action">
                  <BiHistory className="action-icon" />
                  Bets History
                </button>
                <button className="sidebar-action">
                  <BiTransfer className="action-icon" />
                  Transactions
                </button>
                <button className="sidebar-action">
                  <BiGift className="action-icon" />
                  My Bonuses
                </button>
              </div>

              <button className="sidebar-link">
                <span className="link-left">
                  <MdOutlineStorefront className="link-icon" />
                  Marketplace
                </span>
                <FiChevronRight className="link-arrow" />
              </button>

              <button className="sidebar-link">
                <span className="link-left">
                  <HiOutlineTrophy className="link-icon" />
                  Discover Loyalty Benefits
                </span>
                <FiChevronRight className="link-arrow" />
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
          </div>
        )}
      </aside>
    </>
  );
}
