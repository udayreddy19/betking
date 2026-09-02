import { FiGift } from '../../icons';
import './AnimatedMotionGiftIcon.css';

export default function AnimatedMotionGiftIcon({ size = 18, className = '', color, paused = false }) {
  return (
    <span className={`aesthetic-motion-gift${paused ? ' aesthetic-motion-gift--paused' : ''} ${className}`.trim()}>
      <FiGift size={size} color={color} />
    </span>
  );
}
