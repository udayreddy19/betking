import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { useAuth } from '../../context/AuthContext';
import { useBetSlip } from '../../context/BetSlipContext';
import { CASINO_ENABLED } from '../../utils/featureFlags';
import { pressScale, springTab } from '../../utils/motionPresets';
import {
  NavHomeIcon,
  NavSportsIcon,
  NavLiveIcon,
  NavCasinoIcon,
  NavPromotionsIcon,
  NavVipIcon,
  NavMenuIcon,
  NavBetslipIcon,
} from './MobileNavIcons';
import { HiOutlineUser } from '../../icons';
import './MobileBottomBar.css';

export default function MobileBottomBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isLoggedIn, toggleSidebar } = useAuth();
  const { betCount, openMobileBetslip } = useBetSlip();

  const navItems = [
    { label: 'Home', path: '/', icon: NavHomeIcon },
    { label: 'Sports', path: '/sports', icon: NavSportsIcon },
    { label: 'Live', path: '/live-betting', icon: NavLiveIcon, badge: 'LIVE' },
    CASINO_ENABLED
      ? { label: 'Casino', path: '/casino', icon: NavCasinoIcon }
      : { label: 'Promos', path: '/promotions', icon: NavPromotionsIcon },
    isLoggedIn
      ? { label: 'Profile', path: '/profile', icon: HiOutlineUser, isProfile: true }
      : { label: 'VIP', path: '/vip', icon: NavVipIcon, isVip: true },
  ];

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
              onClick={() => navigate(item.path)}
              whileTap={{ scale: pressScale }}
              transition={springTab}
            >
              <div className="mobile-bar-icon-wrap">
                <Icon className="mobile-bar-icon" />
                {item.badge && <span className="mobile-bar-live-dot" />}
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
          className={`mobile-bar-item betslip-item ${betCount > 0 ? 'has-bets' : ''}`}
          onClick={betCount > 0 ? openMobileBetslip : toggleSidebar}
          whileTap={{ scale: pressScale }}
          transition={springTab}
        >
          <div className="mobile-bar-icon-wrap">
            {betCount > 0 ? <NavBetslipIcon className="mobile-bar-icon" /> : <NavMenuIcon className="mobile-bar-icon" />}
            {betCount > 0 && <span className="mobile-bar-bet-count">{betCount}</span>}
          </div>
          <span className="mobile-bar-label">{betCount > 0 ? 'Betslip' : 'Menu'}</span>
        </motion.button>
      </div>
    </nav>
  );
}
