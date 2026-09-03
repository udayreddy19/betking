import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../../context/AuthContext';
import { formatInr } from '../../utils/walletBalance';
import { apiFetch } from '../../utils/apiClient';
import { DAILY_SPIN_PRIZES, SPIN_PRIZE_TTL_HOURS } from '../../../lib/dailySpinPrizes.mjs';
import { FiX, FiZap } from '../../icons';
import AnimatedMotionGiftIcon from '../AnimatedMotionGiftIcon/AnimatedMotionGiftIcon';
import './DailySpinModal.css';

import { playWinSound } from '../../utils/soundEffects';
import { formatIst } from '../../utils/istTime';

const WHEEL_SECTORS = DAILY_SPIN_PRIZES;

function formatExpiryLabel(prize) {
  if (!prize || prize.type === 'xp') return null;
  if (prize.expired) return 'Expired — unused spin credit was removed';
  if (prize.expiresAt) {
    return `Use within ${SPIN_PRIZE_TTL_HOURS}h · expires ${formatIst(prize.expiresAt, {
      hour: '2-digit',
      minute: '2-digit',
      day: 'numeric',
      month: 'short',
      hour12: true,
    })}`;
  }
  return `Use bonus/freebet within ${SPIN_PRIZE_TTL_HOURS} hours or it expires`;
}

export default function DailySpinModal({ isOpen, onClose }) {
  const { updateUser, refreshWallet, showToast } = useAuth();
  const [isSpinning, setIsSpinning] = useState(false);
  const [wheelPhase, setWheelPhase] = useState('idle');
  const [rotationDegree, setRotationDegree] = useState(0);
  const [wonPrize, setWonPrize] = useState(null);
  const [prizeMeta, setPrizeMeta] = useState(null);
  const [hasSpunToday, setHasSpunToday] = useState(false);

  const applyWallet = (wallet, spinGrants = null) => {
    if (!wallet) return;
    updateUser({
      bonusBalance: Number(wallet.bonusBalance) || 0,
      freebetBalance: Number(wallet.freebetBalance) || 0,
      loyaltyPoints: Number(wallet.loyaltyPoints) || 0,
      coins: Number(wallet.loyaltyPoints) || 0,
      spinGrants: spinGrants || undefined,
    });
  };

  useEffect(() => {
    if (!isOpen) {
      setIsSpinning(false);
      setWheelPhase('idle');
      return undefined;
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/api/v1/rewards/daily-spin');
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        applyWallet(data.wallet, data.spinGrants);
        if (data.hasSpunToday && data.prize) {
          setHasSpunToday(true);
          setPrizeMeta(data.prize);
          setWonPrize(WHEEL_SECTORS[data.prize.index] || data.prize);
        }
      } catch {
        // Keep local UI if status fetch fails.
      }
    })();
    return () => {
      cancelled = true;
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  if (!isOpen || typeof document === 'undefined') return null;

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
    setWheelPhase('waiting');
    setWonPrize(null);

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const abortTimer = controller
      ? window.setTimeout(() => controller.abort(), 20000)
      : null;

    try {
      const res = await apiFetch('/api/v1/rewards/daily-spin', {
        method: 'POST',
        body: JSON.stringify({}),
        signal: controller?.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.prize) {
        setIsSpinning(false);
        setWheelPhase('idle');
        showToast(data.error || 'Could not save spin. Try again.', 'error');
        return;
      }

      const prize = WHEEL_SECTORS[data.prize.index] || data.prize;
      applyWallet(data.wallet, data.spinGrants);
      setHasSpunToday(true);
      setPrizeMeta(data.prize);
      refreshWallet?.();
      window.dispatchEvent(new CustomEvent('oddsyra:rewards-updated'));

      if (data.alreadySpun) {
        setIsSpinning(false);
        setWheelPhase('idle');
        setWonPrize(prize);
        showToast(data.prize?.expired
          ? 'Your spin prize expired after 24 hours.'
          : 'You already spun today. Prize is in your wallet.', 'info');
        return;
      }

      setWheelPhase('landing');
      landOnIndex(prize.index);
      window.setTimeout(() => {
        setIsSpinning(false);
        setWheelPhase('done');
        setWonPrize(prize);
        playWinSound();
        refreshWallet?.();
        window.dispatchEvent(new CustomEvent('oddsyra:rewards-updated'));
        if (prize.type === 'bonus') {
          showToast(`You won ${formatInr(prize.value)} bonus — use within ${SPIN_PRIZE_TTL_HOURS}h!`, 'success');
        } else if (prize.type === 'freebet') {
          showToast(`You won ${formatInr(prize.value)} freebet — use within ${SPIN_PRIZE_TTL_HOURS}h!`, 'success');
        } else {
          showToast(`You gained ${prize.value} VIP Loyalty XP!`, 'info');
        }
      }, 5200);
    } catch {
      setIsSpinning(false);
      setWheelPhase('idle');
      showToast('Could not save spin. Try again.', 'error');
    } finally {
      if (abortTimer) window.clearTimeout(abortTimer);
    }
  };

  return createPortal(
    <AnimatePresence>
      <div className="daily-spin-backdrop" onClick={onClose} role="presentation">
        <motion.div
          className="daily-spin-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="daily-spin-title"
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.92, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 16 }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        >
          <button type="button" className="spin-close-btn" onClick={onClose} aria-label="Close spin wheel">
            <FiX />
          </button>

          <div className="spin-header">
            <div className="spin-badge">
              <FiZap /> DAILY VIP REWARD WHEEL
            </div>
            <h2 id="daily-spin-title">Spin & Win Free Bonus Rewards!</h2>
            <p>Bonus and freebet prizes must be used within {SPIN_PRIZE_TTL_HOURS} hours or they expire. Loyalty XP is credited instantly.</p>
          </div>

          <div className="wheel-wrapper">
            <div className="wheel-pointer">▼</div>

            <motion.div
              className={`wheel-canvas${wheelPhase === 'waiting' ? ' wheel-canvas--waiting' : ''}`}
              animate={wheelPhase === 'waiting' ? false : { rotate: rotationDegree }}
              transition={{
                duration: wheelPhase === 'landing' || wheelPhase === 'done' ? 5 : 0,
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
                  {prizeMeta?.expired
                    ? 'This spin credit expired after 24 hours without being used.'
                    : wonPrize.type === 'freebet'
                      ? 'Added to your freebet balance.'
                      : wonPrize.type === 'xp'
                        ? 'Added to your loyalty XP.'
                        : 'Added to your bonus wallet balance.'}
                </p>
                {formatExpiryLabel(prizeMeta || wonPrize) && (
                  <p className={`spin-expiry-note${prizeMeta?.expired ? ' spin-expiry-note--expired' : ''}`}>
                    {formatExpiryLabel(prizeMeta || wonPrize)}
                  </p>
                )}
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
    </AnimatePresence>,
    document.body,
  );
}
