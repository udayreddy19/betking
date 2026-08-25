import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { useAuth } from '../../context/AuthContext';
import { useBetSlip } from '../../context/BetSlipContext';
import { CASINO_ENABLED } from '../../utils/featureFlags';
import { pressScale, springTab } from '../../utils/motionPresets';
import {
  NavHomeIcon,
  NavCasinoIcon,
  NavPromotionsIcon,
  NavVipIcon,
  NavMenuIcon,
} from './MobileNavIcons';
import { HiOutlineUser } from '../../icons';
import './MobileBottomBar.css';

export default function MobileBottomBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isLoggedIn, toggleSidebar, closeSidebar } = useAuth();
  const { closeMyBets, closeQuickBet, setIsMobileOpen } = useBetSlip();

  const navItems = useMemo(() => ([
    { label: 'Home', path: '/', icon: NavHomeIcon },
    CASINO_ENABLED
      ? { label: 'Casino', path: '/casino', icon: NavCasinoIcon }
      : { label: 'Promos', path: '/promotions', icon: NavPromotionsIcon },
    isLoggedIn
      ? { label: 'Profile', path: '/profile', icon: HiOutlineUser, isProfile: true }
      : { label: 'VIP', path: '/vip', icon: NavVipIcon, isVip: true },
  ]), [isLoggedIn]);

  const go = (path) => {
    closeSidebar();
    closeMyBets?.();
    closeQuickBet?.();
    setIsMobileOpen?.(false);
    window.dispatchEvent(new CustomEvent('oddsyra:close-support-chat'));
    if (location.pathname === path) return;
    navigate(path);
  };

  return (
    <nav className="mobile-bottom-bar" aria-label="Mobile Navigation">
      <div className="mobile-bottom-bar-inner">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;

          return (
            <motion.button
              key={item.path}
              type="button"
              className={`mobile-bar-item ${isActive ? 'active' : ''} ${item.isVip ? 'vip-item' : ''} ${item.isProfile ? 'profile-item' : ''}`}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => go(item.path)}
              whileTap={{ scale: pressScale }}
              transition={springTab}
            >
              <div className="mobile-bar-icon-wrap">
                <Icon className="mobile-bar-icon" />
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
          whileTap={{ scale: pressScale }}
          transition={springTab}
        >
          <div className="mobile-bar-icon-wrap">
            <NavMenuIcon className="mobile-bar-icon" />
          </div>
          <span className="mobile-bar-label">Menu</span>
        </motion.button>
      </div>
    </nav>
  );
}
