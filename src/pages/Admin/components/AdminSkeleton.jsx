import React from 'react';

/**
 * Loading skeleton primitives for Admin views.
 */

export function SkeletonLine({ width, height = 14, className = '' }) {
  return (
    <div
      className={`admin-skeleton admin-skeleton--line ${className}`}
      style={{ width: width || '100%', height }}
    />
  );
}

export function SkeletonCard({ height = 100, className = '' }) {
  return <div className={`admin-skeleton admin-skeleton--card ${className}`} style={{ height }} />;
}

export function SkeletonRow({ className = '' }) {
  return <div className={`admin-skeleton admin-skeleton--row ${className}`} />;
}

/**
 * Skeleton table with configurable rows.
 */
export function SkeletonTable({ rows = 5, columns = 4 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      {/* Header row */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: '8px', padding: '12px 16px' }}>
        {Array.from({ length: columns }).map((_, i) => (
          <SkeletonLine key={`h-${i}`} width="70%" height={12} />
        ))}
      </div>
      {/* Data rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={`r-${i}`} />
      ))}
    </div>
  );
}

/**
 * Skeleton KPI cards grid.
 */
export function SkeletonKPIGrid({ count = 4 }) {
  return (
    <div className="admin-grid-4" style={{ marginBottom: '20px' }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} height={90} />
      ))}
    </div>
  );
}

export default function AdminSkeleton({ variant = 'line', ...props }) {
  switch (variant) {
    case 'card': return <SkeletonCard {...props} />;
    case 'row': return <SkeletonRow {...props} />;
    case 'table': return <SkeletonTable {...props} />;
    case 'kpi': return <SkeletonKPIGrid {...props} />;
    default: return <SkeletonLine {...props} />;
  }
}
