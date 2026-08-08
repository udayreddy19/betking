import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  HiOutlineHome,
  HiOutlineTrophy,
  HiOutlineCube,
  MdOutlineStorefront,
  FiCrown,
  HiOutlineDocumentText,
  FiMenu,
} from '../../icons';
import { useAuth } from '../../context/AuthContext';
import { useBetSlip } from '../../context/BetSlipContext';
import './MobileBottomBar.css';

export default function MobileBottomBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toggleSidebar } = useAuth();
  const { betCount, openMobileBetslip } = useBetSlip();

  const navItems = [
    { label: 'Home', path: '/', icon: HiOutlineHome },
    { label: 'Sports', path: '/sports', icon: HiOutlineTrophy },
    { label: 'Live', path: '/live-betting', icon: HiOutlineCube, badge: 'LIVE' },
    { label: 'Casino', path: '/casino', icon: MdOutlineStorefront },
    { label: 'VIP', path: '/vip', icon: FiCrown, isVip: true },
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
              className={`mobile-bar-item ${isActive ? 'active' : ''} ${item.isVip ? 'vip-item' : ''}`}
              onClick={() => navigate(item.path)}
              whileTap={{ scale: 0.88 }}
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
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              )}
            </motion.button>
          );
        })}

        {/* Betslip Quick Button */}
        <motion.button
          type="button"
          className="mobile-bar-item betslip-item"
          onClick={betCount > 0 ? openMobileBetslip : toggleSidebar}
          whileTap={{ scale: 0.88 }}
        >
          <div className="mobile-bar-icon-wrap">
            {betCount > 0 ? <HiOutlineDocumentText className="mobile-bar-icon" /> : <FiMenu className="mobile-bar-icon" />}
            {betCount > 0 && <span className="mobile-bar-bet-count">{betCount}</span>}
          </div>
          <span className="mobile-bar-label">{betCount > 0 ? 'Betslip' : 'Menu'}</span>
        </motion.button>
      </div>
    </nav>
  );
}
