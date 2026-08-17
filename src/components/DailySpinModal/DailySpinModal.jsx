import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../../context/AuthContext';
import { formatInr } from '../../utils/walletBalance';
import { FiX, FiZap } from '../../icons';
import AnimatedMotionGiftIcon from '../AnimatedMotionGiftIcon/AnimatedMotionGiftIcon';
import './DailySpinModal.css';

import { playWinSound } from '../../utils/soundEffects';

// Crisp, readable 2-line labels
const WHEEL_SECTORS = [
  { amount: '₹500', subtitle: 'BONUS', type: 'bonus', value: 500, color: '#6d28d9' },
  { amount: '₹200', subtitle: 'FREEBET', type: 'freebet', value: 200, color: '#0284c7' },
  { amount: '500 XP', subtitle: 'BOOST', type: 'xp', value: 500, color: '#d97706' },
  { amount: '₹1,000', subtitle: 'BONUS', type: 'bonus', value: 1000, color: '#7c3aed' },
  { amount: '₹100', subtitle: 'FREEBET', type: 'freebet', value: 100, color: '#0369a1' },
  { amount: '₹2,500', subtitle: 'MEGA BONUS', type: 'bonus', value: 2500, color: '#8b5cf6' },
  { amount: '1,000 XP', subtitle: 'BOOST', type: 'xp', value: 1000, color: '#b45309' },
  { amount: '₹500', subtitle: 'FREEBET', type: 'freebet', value: 500, color: '#1d4ed8' },
];

export default function DailySpinModal({ isOpen, onClose }) {
  const { user, updateUser, addBonus, addFreebet, showToast } = useAuth();
  const [isSpinning, setIsSpinning] = useState(false);
  const [rotationDegree, setRotationDegree] = useState(0);
  const [wonPrize, setWonPrize] = useState(null);
  const [hasSpunToday, setHasSpunToday] = useState(false);

  if (!isOpen) return null;

  const numSectors = WHEEL_SECTORS.length;
  const sectorAngle = 360 / numSectors;

  const handleSpin = () => {
    if (isSpinning || hasSpunToday) return;

    setIsSpinning(true);
    setWonPrize(null);

    const winningIndex = Math.floor(Math.random() * numSectors);

    const fullSpins = 6 * 360;
    const targetOffset = 360 - (winningIndex * sectorAngle + sectorAngle / 2);
    const newRotation = rotationDegree + fullSpins + targetOffset;

    setRotationDegree(newRotation);

    setTimeout(() => {
      setIsSpinning(false);
      const prize = WHEEL_SECTORS[winningIndex];
      setWonPrize(prize);
      setHasSpunToday(true);
      playWinSound();

      if (prize.type === 'bonus') {
        addBonus(prize.value, `Spin Wheel · ${prize.amount} Bonus`);
        showToast(`You won ${formatInr(prize.value)} Bonus Credit!`, 'success');
      } else if (prize.type === 'freebet') {
        addFreebet(prize.value, `Spin Wheel · ${prize.amount} Freebet`);
        showToast(`⚡ You unlocked a ${formatInr(prize.value)} Freebet Voucher!`, 'success');
      } else {
        const currentXp = user?.loyaltyPoints || 0;
        updateUser({ loyaltyPoints: currentXp + prize.value, coins: (user?.coins || 0) + prize.value });
        showToast(`⭐ You gained ${prize.value} VIP Loyalty XP!`, 'info');
      }
    }, 5200);
  };

  return (
    <AnimatePresence>
      <div className="daily-spin-backdrop" onClick={onClose}>
        <motion.div
          className="daily-spin-modal"
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.85, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.85, y: 30 }}
          transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
        >
          <button className="spin-close-btn" onClick={onClose}>
            <FiX />
          </button>

          <div className="spin-header">
            <div className="spin-badge">
              <FiZap /> DAILY VIP REWARD WHEEL
            </div>
            <h2>Spin & Win Free Bonus Rewards!</h2>
            <p>Spin daily to win Bonus Balance, Freebet Vouchers, and VIP Loyalty XP.</p>
          </div>

          {/* SVG Vector Wheel */}
          <div className="wheel-wrapper">
            <div className="wheel-pointer">▼</div>

            <motion.div
              className="wheel-canvas"
              animate={{ rotate: rotationDegree }}
              transition={{
                duration: 5,
                ease: [0.12, 0, 0.25, 1],
              }}
            >
              <svg viewBox="0 0 340 340" className="wheel-svg">
                <g transform="translate(170, 170)">
                  {WHEEL_SECTORS.map((sec, idx) => {
                    const startAngle = idx * sectorAngle - 90;
                    const endAngle = (idx + 1) * sectorAngle - 90;

                    const x1 = 165 * Math.cos((startAngle * Math.PI) / 180);
                    const y1 = 145 * Math.sin((startAngle * Math.PI) / 180);
                    const x2 = 165 * Math.cos((endAngle * Math.PI) / 180);
                    const y2 = 165 * Math.sin((endAngle * Math.PI) / 180);

                    const pathData = `M 0 0 L ${x1} ${y1} A 165 165 0 0 1 ${x2} ${y2} Z`;
                    const midAngle = startAngle + sectorAngle / 2;
                    const textRad = (midAngle * Math.PI) / 180;
                    const tx = 110 * Math.cos(textRad);
                    const ty = 110 * Math.sin(textRad);

                    // Ensure text is never upside down for maximum readability
                    let rotation = midAngle + 90;
                    if (midAngle > 0 && midAngle < 180) {
                      rotation += 180;
                    }

                    return (
                      <g key={sec.amount + idx}>
                        <path d={pathData} fill={sec.color} stroke="#0f172a" strokeWidth="2.5" />
                        <g transform={`translate(${tx}, ${ty}) rotate(${rotation})`}>
                          <text
                            x="0"
                            y="-6"
                            fill="#ffffff"
                            fontSize="13"
                            fontWeight="900"
                            textAnchor="middle"
                            dominantBaseline="central"
                            className="sector-amount-text"
                          >
                            {sec.amount}
                          </text>
                          <text
                            x="0"
                            y="8"
                            fill="rgba(255, 255, 255, 0.85)"
                            fontSize="8"
                            fontWeight="800"
                            textAnchor="middle"
                            dominantBaseline="central"
                            letterSpacing="0.05em"
                          >
                            {sec.subtitle}
                          </text>
                        </g>
                      </g>
                    );
                  })}
                </g>
              </svg>
            </motion.div>

            <div className="wheel-center-cap">
              <span>ODDSYRA</span>
            </div>
          </div>

          {wonPrize && (
            <motion.div
              className="won-prize-card"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <span className="prize-emoji">
                <AnimatedMotionGiftIcon size={32} />
              </span>
              <div>
                <h4>YOU WON {wonPrize.amount} {wonPrize.subtitle}!</h4>
                <p>Added to your bonus wallet balance.</p>
              </div>
            </motion.div>
          )}

          <div className="spin-action-row">
            <motion.button
              type="button"
              className={`spin-trigger-btn ${hasSpunToday ? 'disabled' : ''}`}
              onClick={handleSpin}
              disabled={isSpinning || hasSpunToday}
              whileHover={{ scale: isSpinning || hasSpunToday ? 1 : 1.04 }}
              whileTap={{ scale: isSpinning || hasSpunToday ? 1 : 0.96 }}
            >
              {isSpinning ? 'SPINNING...' : hasSpunToday ? 'SPUN TODAY · NEXT IN 24H' : 'SPIN WHEEL NOW 🎰'}
            </motion.button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
