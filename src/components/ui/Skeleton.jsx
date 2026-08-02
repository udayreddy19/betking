import './ui.css';

export default function Skeleton({
  className = '',
  variant = 'text',
  width,
  height,
  style,
  ...props
}) {
  const variantClass = variant === 'card' ? 'ui-skeleton--card'
    : variant === 'circle' ? 'ui-skeleton--circle'
    : 'ui-skeleton--text';

  return (
    <div
      className={`ui-skeleton ${variantClass} ${className}`.trim()}
      style={{ width, height, ...style }}
      aria-hidden="true"
      {...props}
    />
  );
}

export function MatchCardSkeleton() {
  return (
    <div className="ui-skeleton ui-skeleton--card match-card-skeleton" aria-hidden="true">
      <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <Skeleton height={12} width="60%" />
        <Skeleton height={10} width="40%" />
        <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
          <Skeleton variant="circle" width={36} height={36} />
          <Skeleton height={14} width="50%" />
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
          <Skeleton height={36} style={{ flex: 1 }} />
          <Skeleton height={36} style={{ flex: 1 }} />
          <Skeleton height={36} style={{ flex: 1 }} />
        </div>
      </div>
    </div>
  );
}
