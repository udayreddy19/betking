import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiChevronDown, FiChevronUp, FiPlay } from '../../icons';
import { adminApiClient } from '../../pages/Admin/api/adminApiClient';
import './DatabaseSqlTerminal.css';

function formatCell(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

function outputColumns(fields, rows) {
  if (fields?.length) return fields.map((f) => f.name);
  if (!rows?.length) return [];
  return Object.keys(rows[0]);
}

export default function DatabaseSqlTerminal({ selectedTable = '' }) {
  const [open, setOpen] = useState(false);
  const [sql, setSql] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const textareaRef = useRef(null);
  const historyRef = useRef([]);

  const tableSnippet = useMemo(() => {
    if (!selectedTable) return '';
    const safe = String(selectedTable).replace(/"/g, '""');
    return `SELECT * FROM "${safe}" LIMIT 20`;
  }, [selectedTable]);

  useEffect(() => {
    if (!selectedTable || sql.trim()) return;
    setSql(tableSnippet);
  }, [selectedTable, tableSnippet, sql]);

  const runQuery = useCallback(async () => {
    const trimmed = sql.trim();
    if (!trimmed) {
      setError('Enter a SQL statement');
      setResult(null);
      return;
    }

    setRunning(true);
    setError('');
    try {
      const data = await adminApiClient.post('/db/query', { sql: trimmed });
      setResult(data);
      historyRef.current = [trimmed, ...historyRef.current.filter((q) => q !== trimmed)].slice(0, 20);
    } catch (err) {
      setResult(null);
      setError(err.message || 'Query failed');
    } finally {
      setRunning(false);
    }
  }, [sql]);

  const onKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      runQuery();
    }
  };

  const columns = outputColumns(result?.fields, result?.rows);
  const showTable = columns.length > 0 && Array.isArray(result?.rows);

  return (
    <section className={`db-sql-terminal ${open ? 'is-open' : ''}`} aria-label="SQL console">
      <button
        type="button"
        className="db-sql-terminal-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="db-sql-terminal-title">SQL console</span>
        <span className="db-sql-terminal-hint">SELECT · WITH · EXPLAIN · read-only</span>
        {open ? <FiChevronUp aria-hidden /> : <FiChevronDown aria-hidden />}
      </button>

      {open && (
        <div className="db-sql-terminal-body">
          <div className="db-sql-terminal-editor">
            <textarea
              ref={textareaRef}
              className="db-sql-terminal-input"
              spellCheck={false}
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder='SELECT * FROM "users" LIMIT 20'
              rows={4}
              disabled={running}
            />
            <div className="db-sql-terminal-toolbar">
              {tableSnippet && (
                <button
                  type="button"
                  className="db-sql-snippet"
                  onClick={() => setSql(tableSnippet)}
                  disabled={running}
                >
                  {selectedTable} sample
                </button>
              )}
              <button
                type="button"
                className="db-sql-run"
                onClick={runQuery}
                disabled={running}
              >
                <FiPlay aria-hidden />
                {running ? 'Running…' : 'Run'}
              </button>
              <span className="db-sql-kbd">Ctrl+Enter</span>
            </div>
          </div>

          {error && (
            <div className="db-sql-terminal-error" role="alert">
              {error}
            </div>
          )}

          {result && !error && (
            <div className="db-sql-terminal-output">
              <div className="db-sql-meta">
                {result.command && <span>{result.command}</span>}
                <span>
                  {result.rowCount ?? 0} row{(result.rowCount ?? 0) === 1 ? '' : 's'}
                  {result.truncated ? ' (truncated to 500)' : ''}
                  {result.durationMs != null ? ` · ${result.durationMs} ms` : ''}
                </span>
              </div>
              {showTable ? (
                <div className="db-sql-result-scroll">
                  <table className="db-sql-result-table">
                    <thead>
                      <tr>
                        {columns.map((col) => (
                          <th key={col}>{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row, idx) => (
                        <tr key={idx}>
                          {columns.map((col) => (
                            <td key={col} title={formatCell(row[col])}>
                              {row[col] === null || row[col] === undefined ? (
                                <span className="db-sql-null">NULL</span>
                              ) : (
                                formatCell(row[col])
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <pre className="db-sql-text-output">
                  {result.rows?.length
                    ? result.rows.map((row) => JSON.stringify(row)).join('\n')
                    : '(no rows)'}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
