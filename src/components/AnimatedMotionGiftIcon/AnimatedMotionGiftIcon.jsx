import { motion } from 'motion/react';
import { FiGift } from '../../icons';
import './AnimatedMotionGiftIcon.css';

export default function AnimatedMotionGiftIcon({ size = 18, className = '', color, animate = true }) {
  return (
    <motion.span
      className={`aesthetic-motion-gift ${className}`.trim()}
      animate={
        animate
          ? {
              y: [0, -2, 0, 2, 0],
              rotate: [0, -4, 0, 4, 0],
              scale: [1, 1.06, 1, 1.06, 1],
            }
          : {}
      }
      transition={{
        duration: 2.8,
        repeat: Infinity,
        repeatType: 'loop',
        ease: 'easeInOut',
      }}
      whileHover={{
        scale: 1.25,
        rotate: [0, -12, 12, 0],
        transition: { duration: 0.3 },
      }}
      whileTap={{ scale: 0.88 }}
    >
      <FiGift size={size} color={color} />
    </motion.span>
  );
}
