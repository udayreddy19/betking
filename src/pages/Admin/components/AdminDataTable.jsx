import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';

function SortIcon({ direction }) {
  if (direction === 'asc') {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: '4px' }}>
        <path d="m18 15-6-6-6 6"/>
      </svg>
    );
  }
  if (direction === 'desc') {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: '4px' }}>
        <path d="m6 9 6 6 6-6"/>
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: '4px', opacity: 0.3 }}>
      <path d="m7 15 5 5 5-5"/>
      <path d="m7 9 5-5 5 5"/>
    </svg>
  );
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/**
 * Reusable, high-density Admin Data Table component
 * Supports searching, sorting, pagination, status badges, CSV export,
 * row selection, loading/error states, page-size selector, refresh, and sticky header.
 * Columns may set `hideOnMobile` or `priority: 'low'` to hide on narrow screens.
 */
export default function AdminDataTable({
  columns = [],
  data = [],
  searchable = true,
  searchPlaceholder = 'Search records...',
  pageSize: initialPageSize = 10,
  onRowClick,
  emptyMessage = 'No operational records found',
  title = '',
  actions = null,
  loading = false,
  error = null,
  onRefresh,
  lastUpdated,
  /** Optional: render expanded detail panel for a row */
  renderExpandedRow = null,
  /** Prefer card layout under 767px instead of squeezed tables */
  mobileCards = true,
  /** Keys to show as primary fields on mobile cards (defaults to first 3 columns) */
  mobilePrimaryKeys = null,
}) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [expandedIds, setExpandedIds] = useState(() => new Set());

  const colClassName = (col) => {
    const hide = col.hideOnMobile === true || col.priority === 'low';
    return hide ? 'admin-table-col--hide-mobile' : undefined;
  };

  const toggleExpand = (row) => {
    const id = row.id ?? row.key;
    if (id == null) return;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredData = useMemo(() => {
    if (!search.trim()) return data;
    const query = search.toLowerCase();
    return data.filter((item) =>
      columns.some((col) => {
        const val = col.accessor ? col.accessor(item) : item[col.key];
        return String(val ?? '').toLowerCase().includes(query);
      })
    );
  }, [data, search, columns]);

  const sortedData = useMemo(() => {
    if (!sortKey) return filteredData;
    const col = columns.find((c) => c.key === sortKey);
    return [...filteredData].sort((a, b) => {
      const valA = col.accessor ? col.accessor(a) : a[sortKey];
      const valB = col.accessor ? col.accessor(b) : b[sortKey];
      if (valA === valB) return 0;
      const res = valA > valB ? 1 : -1;
      return sortDirection === 'asc' ? res : -res;
    });
  }, [filteredData, sortKey, sortDirection, columns]);

  const totalPages = Math.ceil(sortedData.length / pageSize) || 1;
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const primaryCols = useMemo(() => {
    if (Array.isArray(mobilePrimaryKeys) && mobilePrimaryKeys.length) {
      return columns.filter((c) => mobilePrimaryKeys.includes(c.key));
    }
    return columns.filter((c) => !c.hideOnMobile && c.priority !== 'low').slice(0, 4);
  }, [columns, mobilePrimaryKeys]);

  const exportCSV = () => {
    if (!data.length) return;
    const headers = columns.map((c) => c.header).join(',');
    const rows = sortedData.map((row) =>
      columns
        .map((c) => {
          const val = c.accessor ? c.accessor(row) : row[c.key];
          return `"${String(val ?? '').replace(/"/g, '""')}"`;
        })
        .join(',')
    );
    const csvContent = [headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `${title.toLowerCase().replace(/\s+/g, '_') || 'export'}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Skeleton rows for loading state
  const renderSkeletonRows = () => (
    Array.from({ length: 5 }).map((_, i) => (
      <tr key={`skel-${i}`} style={{ borderBottom: '1px solid var(--admin-border)' }}>
        {columns.map((col, ci) => (
          <td key={ci} className={colClassName(col)} style={{ padding: '14px 18px' }}>
            <div className="admin-skeleton admin-skeleton--line" style={{ width: ci === 0 ? '70%' : '50%' }} />
          </td>
        ))}
      </tr>
    ))
  );

  return (
    <div className="admin-table-container" style={{ margin: '16px 0' }}>
      {/* Header Toolbar */}
      <div className="admin-table-header">
        {title ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ width: '3px', height: '16px', borderRadius: '2px', background: 'linear-gradient(180deg, #6366f1, #3b82f6)' }} />
            <h3 className="admin-table-header__title">{title}</h3>
            <span className="admin-badge admin-badge--neutral" style={{ fontSize: '0.68rem', padding: '1px 7px' }}>
              {sortedData.length}
            </span>
          </div>
        ) : <div />}

        <div className="admin-table-header__actions">
          {searchable && (
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--admin-text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: '10px', pointerEvents: 'none' }}>
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.3-4.3"/>
              </svg>
              <input
                type="text"
                placeholder={searchPlaceholder}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                className="admin-input"
                style={{
                  padding: '6px 10px 6px 30px',
                  minWidth: '200px',
                  fontSize: '0.78rem',
                }}
              />
            </div>
          )}

          {actions}

          {onRefresh && (
            <button
              type="button"
              className="admin-btn admin-btn--ghost admin-btn--sm"
              onClick={onRefresh}
              title="Refresh data"
            >
              ↻
            </button>
          )}

          <button
            type="button"
            className="admin-btn admin-btn--secondary admin-btn--sm"
            onClick={exportCSV}
            style={{ color: '#818cf8' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div style={{
          padding: '10px 18px',
          background: 'rgba(244, 63, 94, 0.08)',
          borderBottom: '1px solid rgba(244, 63, 94, 0.2)',
          color: '#fb7185',
          fontSize: '0.8rem',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <span>⚠</span>
          <span>{error}</span>
          {onRefresh && (
            <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={onRefresh} style={{ color: '#fb7185', marginLeft: 'auto' }}>
              Retry
            </button>
          )}
        </div>
      )}

      {/* Mobile card list — preferred on narrow screens */}
      {mobileCards && (
        <div className="admin-table-mobile-cards" aria-label={title || 'Records'}>
          {loading ? (
            <div style={{ padding: 16 }}><div className="admin-skeleton admin-skeleton--card" style={{ height: 80 }} /></div>
          ) : paginatedData.length === 0 ? (
            <div className="admin-empty-state" style={{ padding: 24 }}>
              <h3 className="admin-empty-state__title">{emptyMessage}</h3>
            </div>
          ) : (
            paginatedData.map((row, idx) => {
              const rid = row.id ?? row.key ?? idx;
              const isOpen = expandedIds.has(rid);
              return (
                <div
                  key={rid}
                  className={`admin-table-card${onRowClick ? ' is-clickable' : ''}`}
                  onClick={() => onRowClick && onRowClick(row)}
                  onKeyDown={(e) => {
                    if (onRowClick && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      onRowClick(row);
                    }
                  }}
                  role={onRowClick ? 'button' : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                >
                  <div className="admin-table-card__primary">
                    {primaryCols.map((col) => (
                      <div key={col.key || col.header} className="admin-table-card__field">
                        <span className="admin-table-card__label">{col.header}</span>
                        <span className="admin-table-card__value">
                          {col.render ? col.render(row) : (col.accessor ? col.accessor(row) : row[col.key])}
                        </span>
                      </div>
                    ))}
                  </div>
                  {renderExpandedRow && (
                    <button
                      type="button"
                      className="admin-btn admin-btn--ghost admin-btn--sm"
                      style={{ marginTop: 8 }}
                      onClick={(e) => { e.stopPropagation(); toggleExpand(row); }}
                      aria-expanded={isOpen}
                    >
                      {isOpen ? 'Hide details' : 'Show details'}
                    </button>
                  )}
                  {isOpen && renderExpandedRow && (
                    <div className="admin-table-card__expanded">
                      {renderExpandedRow(row)}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Desktop / tablet table */}
      <div className={`admin-table-scroll${mobileCards ? ' admin-table-scroll--desktop' : ''}`} style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
          <thead>
            <tr style={{ background: 'var(--admin-surface)', borderBottom: '1px solid var(--admin-border)' }}>
              {renderExpandedRow && (
                <th style={{ width: 36, padding: '10px 8px' }} aria-label="Expand" />
              )}
              {columns.map((col) => {
                const isSorted = sortKey === col.key;
                const isSortable = col.sortable !== false;
                return (
                  <th
                    key={col.key || col.header}
                    className={colClassName(col)}
                    onClick={() => isSortable && handleSort(col.key)}
                    style={{
                      padding: '10px 18px',
                      fontWeight: 700,
                      color: isSorted ? '#818cf8' : 'var(--admin-text-muted)',
                      fontSize: '0.7rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      cursor: isSortable ? 'pointer' : 'default',
                      userSelect: 'none',
                      whiteSpace: 'nowrap',
                      transition: 'color 0.15s ease',
                      position: 'sticky',
                      top: 0,
                      background: 'var(--admin-panel)',
                      zIndex: 2,
                    }}
                  >
                    {col.header}
                    {isSortable && <SortIcon direction={isSorted ? sortDirection : null} />}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? renderSkeletonRows() : (
              <AnimatePresence>
                {paginatedData.length > 0 ? (
                  paginatedData.map((row, idx) => {
                    const rid = row.id ?? row.key ?? idx;
                    const isOpen = expandedIds.has(rid);
                    return (
                      <React.Fragment key={rid}>
                        <motion.tr
                          initial={{ opacity: 0, y: 3 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.1, delay: idx * 0.01 }}
                          whileHover={{ backgroundColor: 'rgba(255, 255, 255, 0.03)' }}
                          onClick={() => onRowClick && onRowClick(row)}
                          style={{
                            borderBottom: '1px solid var(--admin-border)',
                            cursor: onRowClick || renderExpandedRow ? 'pointer' : 'default',
                            transition: 'background-color 0.15s ease',
                          }}
                        >
                          {renderExpandedRow && (
                            <td style={{ padding: '8px', verticalAlign: 'middle' }}>
                              <button
                                type="button"
                                className="admin-btn admin-btn--ghost admin-btn--icon"
                                aria-label={isOpen ? 'Collapse row' : 'Expand row'}
                                aria-expanded={isOpen}
                                onClick={(e) => { e.stopPropagation(); toggleExpand(row); }}
                                style={{ width: 28, height: 28 }}
                              >
                                {isOpen ? '▾' : '▸'}
                              </button>
                            </td>
                          )}
                          {columns.map((col) => (
                            <td
                              key={col.key || col.header}
                              className={colClassName(col)}
                              style={{
                                padding: '11px 18px',
                                color: 'var(--admin-text)',
                                fontVariantNumeric: 'tabular-nums',
                                verticalAlign: 'middle',
                              }}
                            >
                              {col.render ? col.render(row) : (col.accessor ? col.accessor(row) : row[col.key])}
                            </td>
                          ))}
                        </motion.tr>
                        {isOpen && renderExpandedRow && (
                          <tr className="admin-table-expanded-row">
                            <td colSpan={columns.length + 1} style={{ padding: '12px 18px', background: 'var(--admin-surface)' }}>
                              {renderExpandedRow(row)}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={columns.length + (renderExpandedRow ? 1 : 0)} style={{ padding: '40px 24px', textAlign: 'center' }}>
                      <div className="admin-empty-state" style={{ padding: '16px' }}>
                        <div className="admin-empty-state__icon">🔍</div>
                        <h3 className="admin-empty-state__title">{emptyMessage}</h3>
                        {search && (
                          <p className="admin-empty-state__description">
                            Try refining or clearing your search term &quot;{search}&quot;
                          </p>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </AnimatePresence>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer with pagination + page-size + metadata */}
      <div className="admin-table-footer">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span>
            Showing <strong style={{ color: 'var(--admin-text)' }}>{sortedData.length > 0 ? ((currentPage - 1) * pageSize) + 1 : 0}</strong> to{' '}
            <strong style={{ color: 'var(--admin-text)' }}>{Math.min(currentPage * pageSize, sortedData.length)}</strong> of{' '}
            <strong style={{ color: 'var(--admin-text)' }}>{sortedData.length}</strong>
          </span>

          {/* Page size selector */}
          <select
            className="admin-select"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            style={{ padding: '2px 22px 2px 6px', fontSize: '0.74rem', minWidth: 'auto' }}
          >
            {PAGE_SIZE_OPTIONS.map((ps) => (
              <option key={ps} value={ps}>{ps} / page</option>
            ))}
          </select>

          {lastUpdated && (
            <span className="admin-table-header__meta">
              Updated {lastUpdated}
            </span>
          )}
        </div>

        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              className="admin-btn admin-btn--secondary admin-btn--sm"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
            >
              ‹ Prev
            </button>

            <span style={{
              padding: '3px 8px',
              borderRadius: 'var(--admin-radius-sm)',
              background: 'rgba(99, 102, 241, 0.1)',
              border: '1px solid rgba(99, 102, 241, 0.2)',
              fontWeight: 700,
              color: '#818cf8',
              fontSize: '0.74rem',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {currentPage} / {totalPages}
            </span>

            <button
              type="button"
              className="admin-btn admin-btn--secondary admin-btn--sm"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
            >
              Next ›
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
