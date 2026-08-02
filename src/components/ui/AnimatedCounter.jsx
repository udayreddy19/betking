import { useEffect, useState } from 'react';
import { motion, useSpring, useMotionValueEvent } from 'motion/react';
import './ui.css';

export default function AnimatedCounter({
  value,
  className = '',
}) {
  const spring = useSpring(value, { stiffness: 120, damping: 20 });
  const [display, setDisplay] = useState(value);

  useMotionValueEvent(spring, 'change', (v) => {
    setDisplay(Math.round(v));
  });

  useEffect(() => {
    spring.set(value);
  }, [value, spring]);

  return (
    <span className={`ui-animated-counter ${className}`.trim()}>
      {display.toLocaleString('en-IN')}
    </span>
  );
}
