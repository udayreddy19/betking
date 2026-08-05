import { motion } from 'motion/react';
import './RupeeSymbol.css';

export default function RupeeSymbol({ size = 18, className = '' }) {
  return (
    <motion.span
      className={`rupee-symbol-wrapper ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        lineHeight: 1,
        marginRight: '4px',
        verticalAlign: 'middle',
      }}
      animate={{
        scale: [1, 1.15, 1, 1.08, 1],
        rotate: [0, 5, -5, 2, 0],
        y: [0, -1.5, 0, -0.8, 0],
      }}
      transition={{
        duration: 3,
        repeat: Infinity,
        repeatType: 'loop',
        ease: 'easeInOut',
      }}
      whileHover={{ scale: 1.3, rotate: 15 }}
    >
      <motion.svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ overflow: 'visible' }}
      >
        {/* Animated Outer Glow Aura */}
        <motion.circle
          cx="12"
          cy="12"
          r="10"
          fill="url(#rupeeAuraGrad)"
          animate={{
            opacity: [0.3, 0.85, 0.3],
            scale: [0.9, 1.2, 0.9],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />

        {/* Rupee Symbol Path */}
        <motion.path
          d="M6 5H18M6 9.5H17M6 5V11.5C8.5 11.5 11 12 12.5 14C14 16 14 18 14 18M8 13L16 21"
          stroke="url(#rupeeGreenGrad)"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          animate={{
            strokeWidth: [2.5, 3.2, 2.5],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />

        {/* Sparkle Dot */}
        <motion.circle
          cx="17"
          cy="5"
          r="1.8"
          fill="#34D399"
          animate={{
            scale: [0, 1.5, 0],
            opacity: [0, 1, 0],
          }}
          transition={{
            duration: 1.8,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />

        <defs>
          <linearGradient id="rupeeGreenGrad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
            <stop stopColor="#10B981" />
            <stop offset="0.5" stopColor="#34D399" />
            <stop offset="1" stopColor="#059669" />
          </linearGradient>
          <radialGradient id="rupeeAuraGrad" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(12 12) scale(10)">
            <stop stopColor="#34D399" stopOpacity="0.5" />
            <stop offset="1" stopColor="#10B981" stopOpacity="0" />
          </radialGradient>
        </defs>
      </motion.svg>
    </motion.span>
  );
}
