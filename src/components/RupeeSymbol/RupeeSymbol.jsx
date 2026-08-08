import { motion } from 'motion/react';
import { IndianRupeeIcon } from '@animateicons/react/lucide';
import './RupeeSymbol.css';

export default function RupeeSymbol({ size = 18, className = '' }) {
  return (
    <motion.span
      className={`rupee-symbol-wrapper ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 1,
        marginRight: '3px',
        verticalAlign: 'middle',
        color: 'currentColor',
      }}
      animate={{
        scale: [1, 1.12, 1],
        y: [0, -1, 0],
      }}
      transition={{
        duration: 2.5,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
      whileHover={{ scale: 1.25, rotate: 12 }}
    >
      <IndianRupeeIcon size={size} />
    </motion.span>
  );
}
