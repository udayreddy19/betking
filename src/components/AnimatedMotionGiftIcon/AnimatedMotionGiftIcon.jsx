import { FiGift } from '../../icons';
import './AnimatedMotionGiftIcon.css';

export default function AnimatedMotionGiftIcon({ size = 18, className = '', color }) {
  return (
    <span className={`aesthetic-motion-gift ${className}`.trim()}>
      <FiGift size={size} color={color} />
    </span>
  );
}
