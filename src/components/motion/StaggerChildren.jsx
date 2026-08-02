import { motion } from 'motion/react';
import { useReducedMotion, motionDuration } from './useReducedMotion';

export default function StaggerChildren({
  children,
  className,
  stagger = 0.06,
  delayChildren = 0.05,
}) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: {
          transition: reduced
            ? {}
            : { staggerChildren: stagger, delayChildren },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className, y = 12 }) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: reduced ? 0 : y },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: motionDuration(reduced, 0.35) },
        },
      }}
    >
      {children}
    </motion.div>
  );
}
