import './RupeeSymbol.css';

/**
 * Animated Rupee Symbol Component
 * Variant: 'text' (default animated gradient text) or 'coin' (3D spinning gold badge)
 */
export default function RupeeSymbol({ variant = 'text', className = '' }) {
  if (variant === 'coin') {
    return (
      <span className={`rupee-symbol rupee-symbol--coin ${className}`} aria-hidden="true">
        ₹
      </span>
    );
  }

  return (
    <span className={`rupee-symbol rupee-symbol--text ${className}`} aria-hidden="true">
      ₹
    </span>
  );
}
