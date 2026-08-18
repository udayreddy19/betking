import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../../context/AuthContext';
import { formatInr } from '../../utils/walletBalance';
import { apiFetch } from '../../utils/apiClient';
import { DAILY_SPIN_PRIZES } from '../../../lib/dailySpinPrizes.mjs';
import { FiX, FiZap } from '../../icons';
import AnimatedMotionGiftIcon from '../AnimatedMotionGiftIcon/AnimatedMotionGiftIcon';
import './DailySpinModal.css';

import { playWinSound } from '../../utils/soundEffects';

const WHEEL_SECTORS = DAILY_SPIN_PRIZES;

export default function DailySpinModal({ isOpen, onClose }) {
  const { updateUser, showToast } = useAuth();
  const [isSpinning, setIsSpinning] = useState(false);
  const [rotationDegree, setRotationDegree] = useState(0);
  const [wonPrize, setWonPrize] = useState(null);
  const [hasSpunToday, setHasSpunToday] = useState(false);

  const applyWallet = (wallet) => {
    if (!wallet) return;
    updateUser({
      bonusBalance: Number(wallet.bonusBalance) || 0,
      freebetBalance: Number(wallet.freebetBalance) || 0,
      loyaltyPoints: Number(wallet.loyaltyPoints) || 0,
      coins: Number(wallet.loyaltyPoints) || 0,
    });
  };

  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/api/v1/rewards/daily-spin');
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        applyWallet(data.wallet);
        if (data.hasSpunToday && data.prize) {
          setHasSpunToday(true);
          setWonPrize(WHEEL_SECTORS[data.prize.index] || data.prize);
        }
      } catch {
        // Keep local UI if status fetch fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const numSectors = WHEEL_SECTORS.length;
  const sectorAngle = 360 / numSectors;

  const landOnIndex = (winningIndex) => {
    const fullSpins = 6 * 360;
    const targetOffset = 360 - (winningIndex * sectorAngle + sectorAngle / 2);
    setRotationDegree((prev) => prev + fullSpins + targetOffset);
  };

  const handleSpin = async () => {
    if (isSpinning || hasSpunToday) return;

    setIsSpinning(true);
    setWonPrize(null);

    try {
      const res = await apiFetch('/api/v1/rewards/daily-spin', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.prize) {
        setIsSpinning(false);
        showToast(data.error || 'Could not save spin. Try again.', 'error');
        return;
      }

      const prize = WHEEL_SECTORS[data.prize.index] || data.prize;
      applyWallet(data.wallet);
      setHasSpunToday(true);

      if (data.alreadySpun) {
        setIsSpinning(false);
        setWonPrize(prize);
        showToast('You already spun today. Prize is in your wallet.', 'info');
        return;
      }

      landOnIndex(prize.index);
      window.setTimeout(() => {
        setIsSpinning(false);
        setWonPrize(prize);
        playWinSound();
        if (prize.type === 'bonus') {
          showToast(`You won ${formatInr(prize.value)} Bonus Credit!`, 'success');
        } else if (prize.type === 'freebet') {
          showToast(`You unlocked a ${formatInr(prize.value)} Freebet Voucher!`, 'success');
        } else {
          showToast(`You gained ${prize.value} VIP Loyalty XP!`, 'info');
        }
      }, 5200);
    } catch {
      setIsSpinning(false);
      showToast('Could not save spin. Try again.', 'error');
    }
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

                    const radius = 165;
                    const x1 = radius * Math.cos((startAngle * Math.PI) / 180);
                    const y1 = radius * Math.sin((startAngle * Math.PI) / 180);
                    const x2 = radius * Math.cos((endAngle * Math.PI) / 180);
                    const y2 = radius * Math.sin((endAngle * Math.PI) / 180);

                    const pathData = `M 0 0 L ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2} Z`;
                    const midAngle = startAngle + sectorAngle / 2;
                    const textRad = (midAngle * Math.PI) / 180;
                    const tx = 110 * Math.cos(textRad);
                    const ty = 110 * Math.sin(textRad);

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
                <p>
                  {wonPrize.type === 'freebet'
                    ? 'Added to your freebet balance.'
                    : wonPrize.type === 'xp'
                      ? 'Added to your loyalty XP.'
                      : 'Added to your bonus wallet balance.'}
                </p>
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
