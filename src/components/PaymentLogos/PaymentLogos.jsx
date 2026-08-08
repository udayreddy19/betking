import { motion } from 'motion/react';

/**
 * 1:1 Pixel-Perfect Official Brand Payment Badges matching the user's reference:
 * - UPI (Green badge #00A859 with official orange/white triangle logo)
 * - Google Pay (Dark badge #1C2333 with official 4-color Google G logo)
 * - PhonePe (Purple badge #5F259F with white circle P logo)
 * - Paytm (Navy blue badge #002970 with white pay and cyan tm logo)
 */

export function UpiLogo({ height = 36, width = 110, className = '', onClick }) {
  return (
    <motion.div
      className={className}
      onClick={onClick}
      style={{
        width: width,
        height: height,
        borderRadius: '8px',
        background: '#00A859',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 12px',
        gap: '8px',
        cursor: onClick ? 'pointer' : 'default',
        boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
        userSelect: 'none',
        flexShrink: 0,
      }}
      whileHover={{ scale: 1.05, y: -1 }}
      whileTap={{ scale: 0.95 }}
      transition={{ duration: 0.15 }}
    >
      {/* Official UPI double-triangle logo */}
      <svg width="22" height="18" viewBox="0 0 22 18" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M7.5 1.5L13.5 16.5H9.5L7.5 10.5L5.5 16.5H1.5L7.5 1.5Z" fill="#FFFFFF" />
        <path d="M14.5 1.5L20.5 16.5H16.5L14.5 10.5L12.5 16.5H8.5L14.5 1.5Z" fill="#F97316" />
      </svg>
      <span style={{
        color: '#FFFFFF',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        fontWeight: 900,
        fontSize: '15px',
        letterSpacing: '0.8px',
      }}>
        UPI
      </span>
    </motion.div>
  );
}

export function GPayLogo({ height = 36, width = 110, className = '', onClick }) {
  return (
    <motion.div
      className={className}
      onClick={onClick}
      style={{
        width: width,
        height: height,
        borderRadius: '8px',
        background: '#1C2333',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 12px',
        gap: '8px',
        cursor: onClick ? 'pointer' : 'default',
        boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
        userSelect: 'none',
        flexShrink: 0,
      }}
      whileHover={{ scale: 1.05, y: -1 }}
      whileTap={{ scale: 0.95 }}
      transition={{ duration: 0.15 }}
    >
      {/* Official 4-color Google G icon */}
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M17.64 9.2c0-.63-.06-1.25-.16-1.84H9v3.49h4.84a4.14 4.14 0 0 1-1.8 2.71v2.25h2.91c1.7-1.57 2.69-3.88 2.69-6.61z" fill="#4285F4"/>
        <path d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.25c-.8.54-1.83.87-3.05.87-2.34 0-4.33-1.58-5.04-3.71H.96v2.33C2.44 15.98 5.48 18 9 18z" fill="#34A853"/>
        <path d="M3.96 10.73A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.28-1.73V4.94H.96A8.99 8.99 0 0 0 0 9c0 1.45.35 2.82.96 4.06l3-2.33z" fill="#FBBC05"/>
        <path d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.94l3 2.33C4.67 5.16 6.66 3.58 9 3.58z" fill="#EA4335"/>
      </svg>
      <span style={{
        color: '#FFFFFF',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        fontWeight: 700,
        fontSize: '15px',
      }}>
        Pay
      </span>
    </motion.div>
  );
}

export function PhonePeLogo({ height = 36, width = 110, className = '', onClick }) {
  return (
    <motion.div
      className={className}
      onClick={onClick}
      style={{
        width: width,
        height: height,
        borderRadius: '8px',
        background: '#5F259F',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 10px',
        gap: '6px',
        cursor: onClick ? 'pointer' : 'default',
        boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
        userSelect: 'none',
        flexShrink: 0,
      }}
      whileHover={{ scale: 1.05, y: -1 }}
      whileTap={{ scale: 0.95 }}
      transition={{ duration: 0.15 }}
    >
      {/* Official PhonePe white circle P logo */}
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="10" cy="10" r="9.5" fill="#FFFFFF"/>
        <path d="M7.8 5.5H11.6C12.9 5.5 13.9 6.5 13.9 7.8C13.9 9.1 12.9 10.1 11.6 10.1H9.5V14.2H7.8V5.5ZM9.5 8.7H11.6C12.1 8.7 12.5 8.3 12.5 7.8C12.5 7.3 12.1 6.9 11.6 6.9H9.5V8.7Z" fill="#5F259F"/>
      </svg>
      <span style={{
        color: '#FFFFFF',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        fontWeight: 800,
        fontSize: '14px',
        letterSpacing: '0.2px',
      }}>
        PhonePe
      </span>
    </motion.div>
  );
}

export function PaytmLogo({ height = 36, width = 110, className = '', onClick }) {
  return (
    <motion.div
      className={className}
      onClick={onClick}
      style={{
        width: width,
        height: height,
        borderRadius: '8px',
        background: '#002970',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 12px',
        cursor: onClick ? 'pointer' : 'default',
        boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
        userSelect: 'none',
        flexShrink: 0,
      }}
      whileHover={{ scale: 1.05, y: -1 }}
      whileTap={{ scale: 0.95 }}
      transition={{ duration: 0.15 }}
    >
      <span style={{
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        fontWeight: 900,
        fontSize: '16px',
        letterSpacing: '-0.6px',
      }}>
        <span style={{ color: '#FFFFFF' }}>pay</span>
        <span style={{ color: '#00BAF2' }}>tm</span>
      </span>
    </motion.div>
  );
}

export function BhimLogo({ height = 36, width = 110, className = '', onClick }) {
  return (
    <motion.div
      className={className}
      onClick={onClick}
      style={{
        width: width,
        height: height,
        borderRadius: '8px',
        background: '#0F172A',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 10px',
        gap: '6px',
        cursor: onClick ? 'pointer' : 'default',
        boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
        userSelect: 'none',
        flexShrink: 0,
      }}
      whileHover={{ scale: 1.05, y: -1 }}
      whileTap={{ scale: 0.95 }}
      transition={{ duration: 0.15 }}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 2L12 9L3 16V2Z" fill="#00A859" />
        <path d="M9 2L18 9L9 16V2Z" fill="#F97316" />
      </svg>
      <span style={{
        color: '#FFFFFF',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        fontWeight: 900,
        fontSize: '14px',
      }}>
        BHIM
      </span>
    </motion.div>
  );
}

export function UpiExpressIcon({ size = 48, className = '' }) {
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
      <UpiLogo height={16} width={42} />
      <GPayLogo height={16} width={42} />
      <PhonePeLogo height={16} width={42} />
      <PaytmLogo height={16} width={42} />
    </motion.div>
  );
}
