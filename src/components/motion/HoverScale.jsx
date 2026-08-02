import { motion } from 'motion/react';
import { useReducedMotion } from './useReducedMotion';

export default function HoverScale({
  children,
  className,
  scale = 1.02,
  lift = -2,
  as = 'div',
  ...props
}) {
  const reduced = useReducedMotion();
  const Component = motion[as] || motion.div;

  if (reduced) {
    const Static = as === 'button' ? 'button' : 'div';
    return (
      <Static className={className} {...props}>
        {children}
      </Static>
    );
  }

  return (
    <Component
      className={className}
      whileHover={{ scale, y: lift }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      {...props}
    >
      {children}
    </Component>
  );
}
