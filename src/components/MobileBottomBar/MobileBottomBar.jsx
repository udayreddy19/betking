import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { useAuth } from '../../context/AuthContext';
import { useBetSlip } from '../../context/BetSlipContext';
import { pressScale, springTab } from '../../utils/motionPresets';
import { useUserNotifications } from '../../hooks/useUserNotifications';
import {
  NavHomeIcon,
  NavCasinoIcon,
  NavPromotionsIcon,
  NavVipIcon,
  NavMenuIcon,
} from './MobileNavIcons';
import { HiOutlineUser, HiOutlineClipboardList, FiZap, IoGiftOutline, FiHelpCircle } from '../../icons';
import './MobileBottomBar.css';

export default function MobileBottomBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isLoggedIn, user, toggleSidebar, closeSidebar, openLoginModal } = useAuth();
  const { closeMyBets, closeQuickBet, setIsMobileOpen, myBetsCount } = useBetSlip();
  const { unreadCount } = useUserNotifications(isLoggedIn, user?.userId);

  const navItems = useMemo(() => {
    if (!isLoggedIn) {
      return [
        { label: 'Home', path: '/', icon: NavHomeIcon },
        { label: 'Support', path: '/help', icon: FiHelpCircle },
        { label: 'Login', action: () => openLoginModal(), icon: HiOutlineUser },
      ];
    }

    return [
      { label: 'Sports', path: '/sports', icon: NavHomeIcon },
      { label: 'Live', path: '/live-betting', icon: FiZap },
      { label: 'Bet Slip', action: () => setIsMobileOpen?.(true), icon: HiOutlineClipboardList, badge: myBetsCount },
      { label: 'Rewards', path: '/rewards', icon: IoGiftOutline },
      { label: 'Profile', path: '/profile', icon: HiOutlineUser },
    ];
  }, [isLoggedIn, location.pathname, navigate, openLoginModal, setIsMobileOpen, myBetsCount]);

  const handleItemClick = (item) => {
    closeSidebar();
    closeMyBets?.();
    closeQuickBet?.();
    window.dispatchEvent(new CustomEvent('oddsyra:close-support-chat'));

    if (item.action) {
      item.action();
      return;
    }

    if (item.path) {
      if (location.pathname === item.path) return;
      navigate(item.path);
    }
  };

  return (
    <nav className="mobile-bottom-bar" aria-label="Mobile Navigation">
      <div className="mobile-bottom-bar-inner">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.path && location.pathname === item.path;

          return (
            <motion.button
              key={item.label}
              type="button"
              className={`mobile-bar-item ${isActive ? 'active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => handleItemClick(item)}
              whileTap={{ scale: pressScale }}
              transition={springTab}
            >
              <div className="mobile-bar-icon-wrap" style={{ position: 'relative' }}>
                <Icon className="mobile-bar-icon" />
                {item.badge > 0 && (
                  <span className="mobile-bar-notif-badge">{item.badge}</span>
                )}
              </div>
              <span className="mobile-bar-label">{item.label}</span>
              {isActive && (
                <motion.div
                  className="mobile-bar-active-pill"
                  layoutId="mobileActiveTab"
                  transition={springTab}
                />
              )}
            </motion.button>
          );
        })}

        <motion.button
          type="button"
          className="mobile-bar-item menu-item"
          onClick={toggleSidebar}
          aria-label={unreadCount > 0 ? `Menu, ${unreadCount} unread notifications` : 'Menu'}
          whileTap={{ scale: pressScale }}
          transition={springTab}
        >
          <div className="mobile-bar-icon-wrap">
            <NavMenuIcon className="mobile-bar-icon" />
            {unreadCount > 0 && (
              <span className="mobile-bar-notif-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
            )}
          </div>
          <span className="mobile-bar-label">Menu</span>
        </motion.button>
      </div>
    </nav>
  );
}
