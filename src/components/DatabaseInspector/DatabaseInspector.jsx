import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { adminApiClient } from '../../pages/Admin/api/adminApiClient';
import AdminModal from '../../pages/Admin/components/AdminModal';
import AdminConfirmDialog from '../../pages/Admin/components/AdminConfirmDialog';
import AdminEmptyState from '../../pages/Admin/components/AdminEmptyState';
import DatabaseSqlTerminal from './DatabaseSqlTerminal';
import KycReminderUsersPanel from './KycReminderUsersPanel';
import './DatabaseInspector.css';

function formatCell(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

function toInputValue(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') return JSON.stringify(val);
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  return String(val);
}

function rowKey(row, primaryKey, fallbackIdx) {
  if (!primaryKey?.length) return String(fallbackIdx);
  return primaryKey.map((k) => `${k}:${String(row[k])}`).join('|');
}

function compareCellValues(a, b) {
  const aNull = a === null || a === undefined;
  const bNull = b === null || b === undefined;
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;

  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);

  const aNum = typeof a === 'string' && a.trim() !== '' && !Number.isNaN(Number(a)) ? Number(a) : null;
  const bNum = typeof b === 'string' && b.trim() !== '' && !Number.isNaN(Number(b)) ? Number(b) : null;
  if (aNum !== null && bNum !== null) return aNum - bNum;

  const aTime = a instanceof Date ? a.getTime() : (typeof a === 'string' && /^\d{4}-\d{2}-\d{2}/.test(a) ? Date.parse(a) : NaN);
  const bTime = b instanceof Date ? b.getTime() : (typeof b === 'string' && /^\d{4}-\d{2}-\d{2}/.test(b) ? Date.parse(b) : NaN);
  if (!Number.isNaN(aTime) && !Number.isNaN(bTime)) return aTime - bTime;

  const aStr = typeof a === 'object' ? JSON.stringify(a) : String(a);
  const bStr = typeof b === 'object' ? JSON.stringify(b) : String(b);
  return aStr.localeCompare(bStr, undefined, { numeric: true, sensitivity: 'base' });
}

function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const text = typeof val === 'object' ? JSON.stringify(val) : String(val);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function downloadCsv(filename, columns, rows) {
  const header = columns.map((c) => csvEscape(c.column_name)).join(',');
  const lines = rows.map((row) => columns.map((c) => csvEscape(row[c.column_name])).join(','));
  const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function DatabaseInspector() {
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [tableData, setTableData] = useState({
    columns: [],
    rows: [],
    totalCount: 0,
    primaryKey: [],
    editable: false,
    deletable: false,
  });
  const [meta, setMeta] = useState({ totalDbSize: '—', availableDiskStorage: '—' });
  const [loadingTables, setLoadingTables] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingKey, setDeletingKey] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [tableFilter, setTableFilter] = useState('');
  const [tableListSort, setTableListSort] = useState('name-asc');
  const [sortColumn, setSortColumn] = useState('');
  const [sortDir, setSortDir] = useState('asc');
  const [editRow, setEditRow] = useState(null);
  const [editDraft, setEditDraft] = useState({});
  const [deleteRow, setDeleteRow] = useState(null);

  const fetchTables = useCallback(async () => {
    setLoadingTables(true);
    setError('');
    try {
      const data = await adminApiClient.get('/db/tables');
      const list = Array.isArray(data?.tables) ? data.tables : [];
      setTables(list);
      setMeta({
        totalDbSize: data?.totalDbSize || '—',
        availableDiskStorage: data?.availableDiskStorage || '—',
      });
      setSelectedTable((prev) => {
        if (prev && list.some((t) => t.tableName === prev)) return prev;
        return list[0]?.tableName || '';
      });
    } catch (err) {
      setTables([]);
      setError(err.message || 'Failed to load database tables');
    } finally {
      setLoadingTables(false);
    }
  }, []);

  const fetchTableData = useCallback(async (tableName) => {
    if (!tableName) return;
    setLoadingRows(true);
    setError('');
    setEditRow(null);
    try {
      const data = await adminApiClient.get(`/db/tables/${encodeURIComponent(tableName)}`);
      setTableData({
        columns: data?.columns || [],
        rows: data?.rows || [],
        totalCount: Number(data?.totalCount ?? data?.rows?.length ?? 0),
        primaryKey: data?.primaryKey || [],
        editable: Boolean(data?.editable),
        deletable: Boolean(data?.deletable),
      });
    } catch (err) {
      setTableData({ columns: [], rows: [], totalCount: 0, primaryKey: [], editable: false, deletable: false });
      setError(err.message || `Failed to load table ${tableName}`);
    } finally {
      setLoadingRows(false);
    }
  }, []);

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  useEffect(() => {
    if (selectedTable) {
      setSortColumn('');
      setSortDir('asc');
      fetchTableData(selectedTable);
    }
  }, [selectedTable, fetchTableData]);

  const visibleTables = useMemo(() => {
    const q = tableFilter.trim().toLowerCase();
    const filtered = q
      ? tables.filter((t) => String(t.tableName || '').toLowerCase().includes(q))
      : [...tables];

    filtered.sort((a, b) => {
      if (tableListSort === 'rows-desc') return (b.rowCount || 0) - (a.rowCount || 0);
      if (tableListSort === 'rows-asc') return (a.rowCount || 0) - (b.rowCount || 0);
      if (tableListSort === 'name-desc') {
        return String(b.tableName || '').localeCompare(String(a.tableName || ''), undefined, { sensitivity: 'base' });
      }
      return String(a.tableName || '').localeCompare(String(b.tableName || ''), undefined, { sensitivity: 'base' });
    });
    return filtered;
  }, [tables, tableFilter, tableListSort]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let rows = q
      ? tableData.rows.filter((row) => JSON.stringify(row).toLowerCase().includes(q))
      : [...tableData.rows];

    if (sortColumn) {
      const dir = sortDir === 'desc' ? -1 : 1;
      rows = [...rows].sort((ra, rb) => dir * compareCellValues(ra[sortColumn], rb[sortColumn]));
    }
    return rows;
  }, [tableData.rows, searchQuery, sortColumn, sortDir]);

  const toggleSort = (columnName) => {
    if (sortColumn === columnName) {
      if (sortDir === 'asc') setSortDir('desc');
      else {
        setSortColumn('');
        setSortDir('asc');
      }
      return;
    }
    setSortColumn(columnName);
    setSortDir('asc');
  };

  const editableColumns = useMemo(
    () => tableData.columns.filter((c) => c.editable !== false && !tableData.primaryKey.includes(c.column_name)),
    [tableData.columns, tableData.primaryKey],
  );

  const openEditor = (row) => {
    if (!tableData.editable) {
      setError('This table has no primary key, so rows cannot be edited safely.');
      return;
    }
    const draft = {};
    editableColumns.forEach((col) => {
      draft[col.column_name] = toInputValue(row[col.column_name]);
    });
    setEditRow(row);
    setEditDraft(draft);
    setNotice('');
    setError('');
  };

  const saveEdit = async () => {
    if (!editRow || !selectedTable) return;
    const primaryKey = {};
    tableData.primaryKey.forEach((col) => {
      primaryKey[col] = editRow[col];
    });

    const updates = {};
    editableColumns.forEach((col) => {
      const next = editDraft[col.column_name];
      const prev = toInputValue(editRow[col.column_name]);
      if (String(next ?? '') !== String(prev ?? '')) {
        updates[col.column_name] = next === '' ? null : next;
      }
    });

    if (!Object.keys(updates).length) {
      setNotice('No changes to save.');
      return;
    }

    setSaving(true);
    setError('');
    setNotice('');
    try {
      const data = await adminApiClient.patch(`/db/tables/${encodeURIComponent(selectedTable)}`, {
        primaryKey,
        updates,
      });
      const updated = data?.row;
      if (updated) {
        setTableData((prev) => ({
          ...prev,
          rows: prev.rows.map((r) => (
            rowKey(r, prev.primaryKey, 0) === rowKey(editRow, prev.primaryKey, 0) ? { ...r, ...updated } : r
          )),
        }));
      } else {
        await fetchTableData(selectedTable);
      }
      setEditRow(null);
      setNotice('Row updated successfully.');
    } catch (err) {
      setError(err.message || 'Failed to update row');
    } finally {
      setSaving(false);
    }
  };

  const exportRows = (format) => {
    if (!selectedTable || !filteredRows.length) {
      setNotice('Nothing to export.');
      return;
    }
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    if (format === 'json') {
      const blob = new Blob([JSON.stringify(filteredRows, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedTable}-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setNotice(`Exported ${filteredRows.length} rows as JSON.`);
      return;
    }
    downloadCsv(`${selectedTable}-${stamp}.csv`, tableData.columns, filteredRows);
    setNotice(`Exported ${filteredRows.length} rows as CSV.`);
  };

  const confirmDelete = async () => {
    if (!deleteRow || !selectedTable) return;
    const primaryKey = {};
    tableData.primaryKey.forEach((col) => {
      primaryKey[col] = deleteRow[col];
    });
    const key = rowKey(deleteRow, tableData.primaryKey, 0);
    setDeletingKey(key);
    setError('');
    setNotice('');
    try {
      await adminApiClient.delete(`/db/tables/${encodeURIComponent(selectedTable)}`, {
        body: JSON.stringify({ primaryKey }),
      });
      setTableData((prev) => ({
        ...prev,
        rows: prev.rows.filter((r) => rowKey(r, prev.primaryKey, 0) !== key),
        totalCount: Math.max(0, (prev.totalCount || 1) - 1),
      }));
      setTables((prev) => prev.map((t) => (
        t.tableName === selectedTable
          ? { ...t, rowCount: Math.max(0, (t.rowCount || 1) - 1) }
          : t
      )));
      setDeleteRow(null);
      setNotice('Row deleted.');
    } catch (err) {
      setError(err.message || 'Failed to delete row');
    } finally {
      setDeletingKey('');
    }
  };

  const formatCount = (n) => Number(n || 0).toLocaleString();

  return (
    <div className="db-inspector-container">
      <div className="db-inspector-header">
        <div className="db-inspector-title">
          <p className="db-inspector-kicker">Platform · Schema</p>
          <h2 className="db-inspector-heading">Database Tables</h2>
          <p className="db-inspector-sub">
            Live PostgreSQL catalog. Browse rows, sort columns, export slices.
            Sensitive auth fields stay hidden.
          </p>
        </div>

        <div className="db-status-pills" aria-label="Database status">
          <span className="status-pill status-pill--pg">
            <span className="live-dot" aria-hidden="true" />
            Size {meta.totalDbSize}
          </span>
          <span className="status-pill status-pill--disk">
            Disk {meta.availableDiskStorage}
          </span>
          <span className="status-pill status-pill--recon">
            {formatCount(tables.length)} tables
          </span>
          <button
            type="button"
            className="refresh-btn"
            onClick={() => {
              fetchTables();
              if (selectedTable) fetchTableData(selectedTable);
            }}
            title="Refresh tables and schema"
            aria-label="Refresh tables and schema"
          >
            ↻
          </button>
        </div>
      </div>

      {error && (
        <div className="db-inspector-error" role="alert">
          <span aria-hidden="true">!</span>
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="db-inspector-notice" role="status">
          <span aria-hidden="true">✓</span>
          <span>{notice}</span>
        </div>
      )}

      <div className="db-inspector-workspace">
        <aside className="db-tables-sidebar" aria-label="Schema catalog">
          <div className="sidebar-title">
            <span className="sidebar-title-text">Catalog</span>
            <span className="sidebar-title-meta">{formatCount(visibleTables.length)}</span>
          </div>

          <div className="db-table-filter">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="search"
              placeholder="Filter tables…"
              value={tableFilter}
              onChange={(e) => setTableFilter(e.target.value)}
              aria-label="Filter tables"
            />
          </div>

          <div className="db-table-sort">
            <span className="db-table-sort-label">Sort</span>
            <select value={tableListSort} onChange={(e) => setTableListSort(e.target.value)} aria-label="Sort tables">
              <option value="name-asc">Name A–Z</option>
              <option value="name-desc">Name Z–A</option>
              <option value="rows-desc">Rows high → low</option>
              <option value="rows-asc">Rows low → high</option>
            </select>
          </div>

          <div className="tables-list" role="listbox" aria-label="Tables">
            {loadingTables && tables.length === 0 && (
              <div className="db-sidebar-empty">Loading catalog…</div>
            )}
            {!loadingTables && visibleTables.length === 0 && (
              <div className="db-sidebar-empty">
                {tableFilter ? `No tables match “${tableFilter}”` : 'No tables found'}
              </div>
            )}
            {visibleTables.map((t) => {
              const isSelected = selectedTable === t.tableName;
              return (
                <button
                  key={t.tableName}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`table-item-btn${isSelected ? ' active' : ''}`}
                  onClick={() => setSelectedTable(t.tableName)}
                  title={`${t.tableName} · ${formatCount(t.rowCount ?? 0)} rows`}
                >
                  <span className="table-name-text">{t.tableName}</span>
                  <span className="table-count-badge">
                    {formatCount(t.rowCount ?? 0)}{t.tableSize ? ` · ${t.tableSize}` : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="db-table-viewer" aria-label="Table studio">
          <div className="table-viewer-header">
            <div className="table-info">
              <div className="table-info-top">
                <span className="table-info-name">{selectedTable || 'Select a table'}</span>
              </div>
              <div className="table-info-badges">
                <span className="admin-badge admin-badge--neutral">
                  {formatCount(tableData.columns.length)} cols
                </span>
                <span className="admin-badge admin-badge--neutral">
                  {formatCount(filteredRows.length)}
                  {tableData.totalCount ? ` / ${formatCount(tableData.totalCount)}` : ''} rows
                </span>
                {selectedTable && (
                  tableData.primaryKey.length > 0 ? (
                    <span className="admin-badge admin-badge--info">
                      PK · {tableData.primaryKey.join(', ')}
                    </span>
                  ) : (
                    <span className="admin-badge admin-badge--warning">
                      No PK · read-only
                    </span>
                  )
                )}
              </div>
            </div>

            <div className="table-viewer-tools">
              {sortColumn && (
                <button
                  type="button"
                  className="db-clear-sort-btn"
                  onClick={() => { setSortColumn(''); setSortDir('asc'); }}
                >
                  Clear sort · {sortColumn} {sortDir === 'desc' ? '↓' : '↑'}
                </button>
              )}
              <div className="table-search-bar">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  type="search"
                  placeholder="Search loaded rows…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Search loaded rows"
                />
              </div>
              <button
                type="button"
                className="db-export-btn"
                disabled={!filteredRows.length}
                onClick={() => exportRows('csv')}
                title="Export visible rows as CSV"
              >
                CSV
              </button>
              <button
                type="button"
                className="db-export-btn"
                disabled={!filteredRows.length}
                onClick={() => exportRows('json')}
                title="Export visible rows as JSON"
              >
                JSON
              </button>
            </div>
          </div>

          {selectedTable === 'kyc_reminder_log' && (
            <div className="db-kyc-slot">
              <KycReminderUsersPanel
                compact
                title="Send KYC completion emails"
                onSent={() => {
                  fetchTableData(selectedTable);
                  fetchTables();
                  setNotice('KYC reminder recorded — refreshing kyc_reminder_log…');
                }}
              />
            </div>
          )}

          <div className="table-rows-wrap">
            {loadingRows ? (
              <div className="loading-state">
                <div className="db-loading-pulse" aria-hidden="true" />
                <span>Loading rows from PostgreSQL…</span>
              </div>
            ) : !selectedTable ? (
              <div className="empty-state">
                <AdminEmptyState
                  icon="⊞"
                  title="Select a table"
                  description="Pick a relation from the catalog to inspect live rows."
                />
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="empty-state">
                <AdminEmptyState
                  icon="∅"
                  title={`No rows in ${selectedTable}`}
                  description={searchQuery
                    ? `Nothing matches “${searchQuery}”. Clear search to see loaded rows.`
                    : selectedTable === 'kyc_reminder_log'
                      ? 'No reminder rows yet. This table fills after KYC emails are queued/sent.'
                      : 'This table currently has no records.'}
                />
              </div>
            ) : (
              <table className="db-data-table">
                <thead>
                  <tr>
                    {tableData.columns.map((col) => {
                      const active = sortColumn === col.column_name;
                      const ariaSort = !active ? 'none' : (sortDir === 'desc' ? 'descending' : 'ascending');
                      return (
                        <th key={col.column_name} aria-sort={ariaSort}>
                          <button
                            type="button"
                            className={`col-header${active ? ' is-active' : ''}`}
                            onClick={() => toggleSort(col.column_name)}
                            title={`${col.column_name} · ${col.data_type} — click to sort`}
                          >
                            <span className="col-name-row">
                              <span className="col-name">{col.column_name}</span>
                              <span className="col-sort-indicator" aria-hidden="true">
                                {active ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                              </span>
                            </span>
                          </button>
                        </th>
                      );
                    })}
                    <th className="db-actions-col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, idx) => (
                    <tr key={rowKey(row, tableData.primaryKey, idx)}>
                      {tableData.columns.map((col) => {
                        const val = row[col.column_name];
                        const text = formatCell(val);
                        return (
                          <td key={col.column_name} title={text !== null ? text : 'NULL'}>
                            {text === null ? (
                              <span className="null-val">NULL</span>
                            ) : typeof val === 'object' ? (
                              <code className="json-code">{text}</code>
                            ) : (
                              text
                            )}
                          </td>
                        );
                      })}
                      <td className="db-actions-col">
                        <div className="db-row-actions">
                          <button
                            type="button"
                            className="db-edit-btn"
                            disabled={!tableData.editable}
                            onClick={() => openEditor(row)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="db-delete-btn"
                            disabled={!tableData.deletable || deletingKey === rowKey(row, tableData.primaryKey, idx)}
                            onClick={() => {
                              setDeleteRow(row);
                              setError('');
                              setNotice('');
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>

      {/* Interactive SQL Console */}
      <DatabaseSqlTerminal selectedTable={selectedTable} />

      {/* Edit Row Modal */}
      <AdminModal
        isOpen={!!editRow}
        onClose={() => !saving && setEditRow(null)}
        title={`Edit Row · ${selectedTable}`}
        subtitle={editRow && tableData.primaryKey.length > 0 ? `PK: ${tableData.primaryKey.map((col) => `${col}=${String(editRow[col])}`).join(', ')}` : ''}
        maxWidth="560px"
        actions={
          <>
            <button
              type="button"
              className="admin-btn admin-btn--secondary"
              onClick={() => setEditRow(null)}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              onClick={saveEdit}
              disabled={saving || editableColumns.length === 0}
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </>
        }
      >
        <div style={{ display: 'grid', gap: '12px' }}>
          {editableColumns.map((col) => (
            <div key={col.column_name} className="admin-form-group">
              <label className="admin-form-label">
                {col.column_name} <span style={{ color: 'var(--admin-text-dim)', textTransform: 'none' }}>({col.data_type})</span>
              </label>
              <input
                type="text"
                className="admin-input"
                value={editDraft[col.column_name] ?? ''}
                onChange={(e) => setEditDraft((prev) => ({ ...prev, [col.column_name]: e.target.value }))}
                disabled={saving}
                style={{ fontFamily: 'var(--admin-font-mono, monospace)' }}
              />
            </div>
          ))}
          {editableColumns.length === 0 && (
            <p style={{ color: 'var(--admin-text-muted)', fontSize: '0.84rem' }}>
              No editable columns on this table.
            </p>
          )}
        </div>
      </AdminModal>

      {/* Delete Row Confirmation Dialog */}
      <AdminConfirmDialog
        isOpen={!!deleteRow}
        variant="danger"
        icon="🗑️"
        title={`Delete row from ${selectedTable}?`}
        description="This action permanently removes this record from the database. It cannot be undone."
        details={deleteRow ? tableData.primaryKey.map((col) => ({
          label: col,
          value: String(deleteRow[col]),
        })) : []}
        confirmLabel="Delete Permanently"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteRow(null)}
        loading={!!deletingKey}
      />
    </div>
  );
}
