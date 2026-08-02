import Button from './Button';
import FadeIn from '../motion/FadeIn';
import './ui.css';

export default function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}) {
  return (
    <FadeIn className={`ui-empty-state ${className}`.trim()}>
      {icon && <span className="ui-empty-state__icon">{icon}</span>}
      {title && <p className="ui-empty-state__title">{title}</p>}
      {description && <p>{description}</p>}
      {actionLabel && onAction && (
        <Button variant="secondary" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </FadeIn>
  );
}
