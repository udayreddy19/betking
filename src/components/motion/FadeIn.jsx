import { motion } from 'motion/react';
import { useReducedMotion, motionDuration } from './useReducedMotion';

export default function FadeIn({
  children,
  className,
  delay = 0,
  duration = 0.35,
  y = 16,
  as = 'div',
  ...props
}) {
  const reduced = useReducedMotion();
  const Component = motion[as] || motion.div;

  return (
    <Component
      className={className}
      initial={{ opacity: 0, y: reduced ? 0 : y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: motionDuration(reduced, duration), delay: reduced ? 0 : delay }}
      {...props}
    >
      {children}
    </Component>
  );
}
