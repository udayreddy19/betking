import { motion } from 'motion/react';
import './PaymentLogos.css';

const ORIGINAL_LOGOS = {
  upi: '/assets/payment-logos/upi-original.png',
  gpay: '/assets/payment-logos/gpay-original.png',
  phonepe: '/assets/payment-logos/phonepe-original.svg',
  paytm: '/assets/payment-logos/paytm-original.png',
};

function PaymentBrandMark({
  src,
  alt,
  height = 36,
  width = 110,
  background = '#ffffff',
  className = '',
  onClick,
}) {
  return (
    <motion.div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={`payment-brand-mark ${className}`.trim()}
      onClick={onClick}
      onKeyDown={onClick ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      } : undefined}
      style={{
        width,
        height,
        background,
        cursor: onClick ? 'pointer' : 'default',
      }}
      whileHover={{ scale: 1.05, y: -1 }}
      whileTap={{ scale: 0.95 }}
      transition={{ duration: 0.15 }}
    >
      <img src={src} alt={alt} draggable={false} />
    </motion.div>
  );
}

export function UpiLogo({ height = 36, width = 110, className = '', onClick }) {
  return (
    <PaymentBrandMark
      src={ORIGINAL_LOGOS.upi}
      alt="UPI"
      height={height}
      width={width}
      background="#111111"
      className={className}
      onClick={onClick}
    />
  );
}

export function GPayLogo({ height = 36, width = 110, className = '', onClick }) {
  return (
    <PaymentBrandMark
      src={ORIGINAL_LOGOS.gpay}
      alt="Google Pay"
      height={height}
      width={width}
      background="#111111"
      className={className}
      onClick={onClick}
    />
  );
}

export function PhonePeLogo({ height = 36, width = 110, className = '', onClick }) {
  return (
    <PaymentBrandMark
      src={ORIGINAL_LOGOS.phonepe}
      alt="PhonePe"
      height={height}
      width={width}
      background="#ffffff"
      className={className}
      onClick={onClick}
    />
  );
}

export function PaytmLogo({ height = 36, width = 110, className = '', onClick }) {
  return (
    <PaymentBrandMark
      src={ORIGINAL_LOGOS.paytm}
      alt="Paytm"
      height={height}
      width={width}
      background="#ffffff"
      className={className}
      onClick={onClick}
    />
  );
}

export function BhimLogo({ height = 36, width = 110, className = '', onClick }) {
  return (
    <motion.div
      className={`payment-brand-mark ${className}`.trim()}
      onClick={onClick}
      style={{
        width,
        height,
        background: '#0F172A',
        cursor: onClick ? 'pointer' : 'default',
        gap: 6,
      }}
      whileHover={{ scale: 1.05, y: -1 }}
      whileTap={{ scale: 0.95 }}
      transition={{ duration: 0.15 }}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M3 2L12 9L3 16V2Z" fill="#00A859" />
        <path d="M9 2L18 9L9 16V2Z" fill="#F97316" />
      </svg>
      <span style={{
        color: '#FFFFFF',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        fontWeight: 900,
        fontSize: Math.max(11, height * 0.4),
      }}>
        BHIM
      </span>
    </motion.div>
  );
}

export function UpiExpressIcon({ size = 48, className = '' }) {
  const tile = Math.max(18, Math.round(size / 2) - 4);
  return (
    <motion.div
      className={`upi-express-motion-box ${className}`.trim()}
      style={{
        width: size,
        height: size,
        borderRadius: '12px',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
        border: '1px solid rgba(124, 58, 237, 0.35)',
        boxShadow: '0 4px 12px rgba(15, 23, 42, 0.4)',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        padding: '4px',
        gap: '3px',
        alignItems: 'center',
        justifyItems: 'center',
        flexShrink: 0,
      }}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.95 }}
      transition={{ duration: 0.15 }}
    >
      <UpiLogo height={tile} width={tile + 6} />
      <GPayLogo height={tile} width={tile + 6} />
      <PhonePeLogo height={tile} width={tile + 6} />
      <PaytmLogo height={tile} width={tile + 6} />
    </motion.div>
  );
}
