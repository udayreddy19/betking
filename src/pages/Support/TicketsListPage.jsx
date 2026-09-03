import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../utils/apiClient';
import { extractTicketsFromResponse } from '../../utils/supportTickets';
import './SupportPages.css';
import { formatIstDate } from '../../utils/istTime';

function formatDate(val) {
  return formatIstDate(val, '—');
}

function StatusBadge({ status }) {
  const norm = String(status || 'OPEN').toLowerCase();
  let cls = 'support-badge--open';
  if (norm === 'in_progress' || norm === 'assigned') cls = 'support-badge--in_progress';
  else if (norm === 'waiting_for_user' || norm === 'pending_user') cls = 'support-badge--waiting_for_user';
  else if (norm === 'resolved') cls = 'support-badge--resolved';
  else if (norm === 'closed') cls = 'support-badge--closed';

  return <span className={`support-badge ${cls}`}>{status || 'OPEN'}</span>;
}

function PriorityBadge({ priority }) {
  const norm = String(priority || 'NORMAL').toLowerCase();
  let cls = 'support-badge--normal';
  if (norm === 'urgent') cls = 'support-badge--urgent';
  else if (norm === 'high') cls = 'support-badge--high';
  else if (norm === 'low') cls = 'support-badge--low';

  return <span className={`support-badge ${cls}`}>{priority || 'NORMAL'}</span>;
}

export default function TicketsListPage() {
  const navigate = useNavigate();
  const { isLoggedIn, openLoginModal } = useAuth();

  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const loadTickets = useCallback(async () => {
    if (!isLoggedIn) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      if (categoryFilter) params.append('category', categoryFilter);
      if (statusFilter) params.append('status', statusFilter);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      params.append('limit', String(limit));
      params.append('offset', String((page - 1) * limit));

      const res = await apiFetch(`/api/v1/support/tickets?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Unable to load tickets.');

      const tickets = extractTicketsFromResponse(data);
      setTickets(tickets);
      setTotal(data.total || tickets.length);
    } catch (err) {
      setError(err.message || 'Unable to load your support tickets.');
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn, categoryFilter, statusFilter, searchQuery, page]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  if (!isLoggedIn) {
    return (
      <div className="support-container">
        <div className="support-empty-state">
          <div className="icon">🔒</div>
          <h2>Log in to view your tickets</h2>
          <p>Please authenticate to access your support history.</p>
          <button type="button" className="support-btn" onClick={openLoginModal} style={{ marginTop: '16px' }}>
            Log In Now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="support-container">
      <div className="support-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ marginBottom: '8px' }}>
            <Link to="/support" style={{ color: '#94a3b8', fontSize: '0.85rem', textDecoration: 'none' }}>
              ← Back to Help & Support
            </Link>
          </div>
          <h1>My Support Tickets</h1>
          <p>Track your submitted issues, active discussions, and resolutions.</p>
        </div>
        <Link to="/support/tickets/new" className="support-btn">
          + Create New Ticket
        </Link>
      </div>

      {error && (
        <div className="support-error-banner">
          <span>{error}</span>
          <button type="button" className="support-btn support-btn--secondary" onClick={loadTickets}>
            Retry
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="support-filter-bar">
        <input
          type="text"
          className="support-input support-search-input"
          placeholder="Search by ticket reference or subject..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setPage(1);
          }}
        />

        <select
          className="support-select"
          style={{ width: 'auto' }}
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All Statuses</option>
          <option value="OPEN">Open</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="WAITING_FOR_USER">Waiting for Reply</option>
          <option value="RESOLVED">Resolved</option>
          <option value="CLOSED">Closed</option>
        </select>

        <select
          className="support-select"
          style={{ width: 'auto' }}
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All Categories</option>
          <option value="DEPOSIT">Deposit</option>
          <option value="WITHDRAWAL">Withdrawal</option>
          <option value="BET">Betting</option>
          <option value="BET_SETTLEMENT">Bet Settlement</option>
          <option value="ACCOUNT">Account</option>
          <option value="KYC">KYC</option>
          <option value="BONUS">Bonus</option>
          <option value="TECHNICAL">Technical</option>
          <option value="OTHER">Other</option>
        </select>
      </div>

      {loading && (
        <div className="support-empty-state">
          <p>Loading your support tickets…</p>
        </div>
      )}

      {!loading && tickets.length === 0 && (
        <div className="support-form-card support-empty-state">
          <div className="icon">📋</div>
          <h2>No support tickets yet.</h2>
          <p>You haven't submitted any tickets matching your search criteria.</p>
          <Link to="/support/tickets/new" className="support-btn" style={{ marginTop: '16px' }}>
            Submit an Issue
          </Link>
        </div>
      )}

      {!loading && tickets.length > 0 && (
        <div className="support-tickets-table-wrap">
          <table className="support-tickets-table">
            <thead>
              <tr>
                <th>Ticket Reference</th>
                <th>Subject</th>
                <th>Category</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Created Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => {
                const ref = t.ticketReference || t.ticketNumber || t.conversationNumber || t.conversationId;
                return (
                  <tr key={t.conversationId || ref} onClick={() => navigate(`/support/tickets/${ref}`)}>
                    <td style={{ fontWeight: 700, color: '#60a5fa' }}>{ref}</td>
                    <td style={{ fontWeight: 600, maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.subject || 'Support Ticket'}
                    </td>
                    <td>{t.category || 'OTHER'}</td>
                    <td>
                      <StatusBadge status={t.status} />
                    </td>
                    <td>
                      <PriorityBadge priority={t.priority} />
                    </td>
                    <td>{formatDate(t.createdAt)}</td>
                    <td>
                      <Link
                        to={`/support/tickets/${ref}`}
                        className="support-btn support-btn--outline"
                        style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {total > limit && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '20px' }}>
          <button
            type="button"
            className="support-btn support-btn--outline"
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <span style={{ display: 'inline-flex', alignItems: 'center', padding: '0 12px', fontSize: '0.88rem', color: '#94a3b8' }}>
            Page {page} of {Math.ceil(total / limit)}
          </span>
          <button
            type="button"
            className="support-btn support-btn--outline"
            disabled={page * limit >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
