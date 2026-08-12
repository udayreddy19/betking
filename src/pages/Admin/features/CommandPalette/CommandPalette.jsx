/**
 * Phase 1: Global Command Palette — ⌘+K / Ctrl+K
 * 
 * Unified search across all platform entities with RBAC-aware filtering,
 * quick actions, and keyboard navigation.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { adminApiClient } from '../../api/adminApiClient';

// Entity type → icon/color mapping
const ENTITY_META = {
  users: { icon: '👤', label: 'Users', color: '#3b82f6' },
  bets: { icon: '🎲', label: 'Bets', color: '#f59e0b' },
  tickets: { icon: '🎫', label: 'Tickets', color: '#8b5cf6' },
  matches: { icon: '🏏', label: 'Matches', color: '#10b981' },
  markets: { icon: '📊', label: 'Markets', color: '#06b6d4' },
  transactions: { icon: '💳', label: 'Transactions', color: '#ec4899' },
  kyc_cases: { icon: '🔍', label: 'KYC Cases', color: '#f97316' },
  fraud_cases: { icon: '🚨', label: 'Fraud Cases', color: '#ef4444' },
  incidents: { icon: '⚠️', label: 'Incidents', color: '#eab308' },
  audit_events: { icon: '📋', label: 'Audit Events', color: '#6b7280' },
};

// Quick actions available from command palette (filtered by RBAC role)
const QUICK_ACTIONS = [
  { id: 'open_user', label: 'Open User Profile', icon: '👤', type: 'navigate', allowedRoles: ['SUPER_ADMIN', 'OPERATIONS_ADMIN', 'RISK_ANALYST', 'SUPPORT_AGENT', 'FINANCE_ADMIN'] },
  { id: 'open_bet', label: 'Open Bet Investigation', icon: '🎲', type: 'navigate', allowedRoles: ['SUPER_ADMIN', 'TRADING_ADMIN', 'RISK_ANALYST', 'SUPPORT_AGENT', 'FINANCE_ADMIN'] },
  { id: 'open_ticket', label: 'Open Support Ticket', icon: '🎫', type: 'navigate', allowedRoles: ['SUPER_ADMIN', 'SUPPORT_AGENT', 'OPERATIONS_ADMIN'] },
  { id: 'review_withdrawal', label: 'Review Withdrawal', icon: '💰', type: 'navigate', dangerous: false, allowedRoles: ['SUPER_ADMIN', 'FINANCE_ADMIN'] },
  { id: 'create_case', label: 'Create New Case', icon: '📁', type: 'action', allowedRoles: ['SUPER_ADMIN', 'OPERATIONS_ADMIN', 'RISK_ANALYST', 'SUPPORT_AGENT'] },
  { id: 'create_incident', label: 'Create Incident', icon: '⚠️', type: 'action', dangerous: true, allowedRoles: ['SUPER_ADMIN', 'OPERATIONS_ADMIN'] },
  { id: 'suspend_market', label: 'Suspend Market', icon: '🔒', type: 'action', dangerous: true, allowedRoles: ['SUPER_ADMIN', 'TRADING_ADMIN', 'RISK_ANALYST'] },
  { id: 'open_audit', label: 'Open Audit Trail', icon: '📋', type: 'navigate', allowedRoles: ['SUPER_ADMIN', 'OPERATIONS_ADMIN', 'RISK_ANALYST'] },
];

export default function CommandPalette({ isOpen, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({});
  const [totalCount, setTotalCount] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mode, setMode] = useState('search'); // search | actions
  const [recentSearches, setRecentSearches] = useState([]);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  const activeRole = typeof window !== 'undefined' ? localStorage.getItem('betking_admin_role') || 'SUPER_ADMIN' : 'SUPER_ADMIN';
  const availableQuickActions = QUICK_ACTIONS.filter(act => !act.allowedRoles || act.allowedRoles.includes(activeRole) || activeRole === 'SUPER_ADMIN');

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setQuery('');
      setResults({});
      setTotalCount(0);
      setSelectedIndex(0);
      setMode('search');
      // Load recent searches
      adminApiClient.get('/command/recent').then(data => {
        setRecentSearches(data.recent || []);
      }).catch(() => {});
    }
  }, [isOpen]);

  // Debounced search
  const performSearch = useCallback(async (searchQuery) => {
    if (!searchQuery || searchQuery.length < 2) {
      setResults({});
      setTotalCount(0);
      return;
    }

    setIsSearching(true);
    try {
      const data = await adminApiClient.post('/command/search', { query: searchQuery, limit: 8 });
      setResults(data.results || {});
      setTotalCount(data.totalCount || 0);
      setSelectedIndex(0);
    } catch (err) {
      console.error('[CommandPalette] Search error:', err);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => performSearch(query), 250);
    return () => clearTimeout(debounceRef.current);
  }, [query, performSearch]);

  // Build flat list of results for keyboard navigation
  const flatResults = [];
  Object.entries(results).forEach(([type, items]) => {
    if (items && items.length > 0) {
      items.forEach(item => flatResults.push({ ...item, _category: type }));
    }
  });

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, flatResults.length - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); }
      if (e.key === 'Enter' && flatResults[selectedIndex]) {
        e.preventDefault();
        handleResultClick(flatResults[selectedIndex]);
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        setMode(m => m === 'search' ? 'actions' : 'search');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, flatResults, selectedIndex, onClose]);

  const handleResultClick = (item) => {
    // Navigate to the entity detail — for now just log
    console.log('[CommandPalette] Selected:', item._entityType, item._displayId);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
          zIndex: 10000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
          paddingTop: '12vh',
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.96 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '640px', maxHeight: '70vh', background: '#111827',
            borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 25px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(59,130,246,0.15)',
            overflow: 'hidden', display: 'flex', flexDirection: 'column',
          }}
        >
          {/* Search Input */}
          <div style={{
            display: 'flex', alignItems: 'center', padding: '16px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.08)', gap: '12px',
          }}>
            <span style={{ fontSize: '1.2rem', opacity: 0.5 }}>🔍</span>
            <input
              ref={inputRef}
              type="text"
              placeholder="Search users, bets, tickets, matches, markets..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: '#f3f4f6', fontSize: '1rem', fontFamily: 'Inter, system-ui, sans-serif',
              }}
            />
            <div style={{
              display: 'flex', gap: '4px', alignItems: 'center',
            }}>
              <kbd style={{
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '4px', padding: '2px 6px', fontSize: '0.7rem', color: '#9ca3af',
              }}>ESC</kbd>
            </div>
          </div>

          {/* Mode Tabs */}
          <div style={{
            display: 'flex', gap: '0', borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}>
            {['search', 'actions'].map(m => (
              <button key={m} onClick={() => setMode(m)} style={{
                flex: 1, padding: '8px 16px', background: mode === m ? 'rgba(59,130,246,0.1)' : 'transparent',
                border: 'none', borderBottom: mode === m ? '2px solid #3b82f6' : '2px solid transparent',
                color: mode === m ? '#60a5fa' : '#6b7280', fontSize: '0.8rem', fontWeight: 600,
                cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em',
                transition: 'all 0.15s ease',
              }}>
                {m === 'search' ? '🔍 Search' : '⚡ Quick Actions'}
              </button>
            ))}
          </div>

          {/* Results */}
          <div style={{ flex: 1, overflowY: 'auto', maxHeight: '50vh' }}>
            {mode === 'search' ? (
              <>
                {isSearching && (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280', fontSize: '0.85rem' }}>
                    Searching...
                  </div>
                )}

                {!isSearching && query.length >= 2 && totalCount === 0 && (
                  <div style={{ padding: '32px 20px', textAlign: 'center', color: '#6b7280' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🔎</div>
                    <div style={{ fontSize: '0.9rem' }}>No results found for &ldquo;{query}&rdquo;</div>
                  </div>
                )}

                {!isSearching && query.length < 2 && recentSearches.length > 0 && (
                  <div style={{ padding: '12px 0' }}>
                    <div style={{ padding: '4px 20px 8px', fontSize: '0.7rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      Recent Searches
                    </div>
                    {recentSearches.slice(0, 5).map((s, i) => (
                      <button key={i} onClick={() => setQuery(s.search_query)} style={{
                        display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
                        padding: '8px 20px', background: 'transparent', border: 'none',
                        color: '#d1d5db', fontSize: '0.85rem', cursor: 'pointer', textAlign: 'left',
                      }}>
                        <span style={{ opacity: 0.4 }}>🕐</span>
                        <span>{s.search_query}</span>
                        <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#6b7280' }}>{s.result_count} results</span>
                      </button>
                    ))}
                  </div>
                )}

                {Object.entries(results).map(([type, items]) => {
                  if (!items || items.length === 0) return null;
                  const meta = ENTITY_META[type] || { icon: '📄', label: type, color: '#6b7280' };
                  return (
                    <div key={type} style={{ padding: '4px 0' }}>
                      <div style={{
                        padding: '6px 20px', fontSize: '0.7rem', fontWeight: 700, color: meta.color,
                        textTransform: 'uppercase', letterSpacing: '0.08em',
                        display: 'flex', alignItems: 'center', gap: '6px',
                      }}>
                        {meta.icon} {meta.label}
                        <span style={{ fontSize: '0.65rem', color: '#6b7280', fontWeight: 400 }}>({items.length})</span>
                      </div>
                      {items.map((item, idx) => {
                        const globalIdx = flatResults.findIndex(r => r._displayId === item._displayId && r._category === type);
                        const isSelected = globalIdx === selectedIndex;
                        return (
                          <motion.button
                            key={`${type}-${idx}`}
                            onClick={() => handleResultClick(item)}
                            whileHover={{ backgroundColor: 'rgba(59,130,246,0.08)' }}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '12px', width: '100%',
                              padding: '10px 20px 10px 32px', background: isSelected ? 'rgba(59,130,246,0.12)' : 'transparent',
                              border: 'none', borderLeft: isSelected ? '3px solid #3b82f6' : '3px solid transparent',
                              color: '#e5e7eb', fontSize: '0.85rem', cursor: 'pointer', textAlign: 'left',
                              transition: 'all 0.1s ease',
                            }}
                          >
                            <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: meta.color, minWidth: '100px' }}>
                              {item._displayId}
                            </span>
                            <span style={{ flex: 1, color: '#d1d5db', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item._displayLabel}
                            </span>
                            {item.status && (
                              <span style={{
                                fontSize: '0.65rem', padding: '2px 8px', borderRadius: '8px',
                                background: item.status === 'OPEN' || item.status === 'ACTIVE' ? 'rgba(16,185,129,0.15)' : 'rgba(107,114,128,0.15)',
                                color: item.status === 'OPEN' || item.status === 'ACTIVE' ? '#34d399' : '#9ca3af',
                                fontWeight: 600,
                              }}>
                                {item.status}
                              </span>
                            )}
                          </motion.button>
                        );
                      })}
                    </div>
                  );
                })}
              </>
            ) : (
              /* Quick Actions Mode */
              <div style={{ padding: '8px 0' }}>
                <div style={{ padding: '6px 20px 8px', fontSize: '0.7rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Quick Actions
                </div>
                {availableQuickActions.map((action) => (
                  <motion.button
                    key={action.id}
                    whileHover={{ backgroundColor: 'rgba(59,130,246,0.08)' }}
                    onClick={() => {
                      if (action.dangerous) {
                        if (!window.confirm(`⚠️ "${action.label}" is a dangerous action. Continue?`)) return;
                      }
                      console.log('[CommandPalette] Quick action:', action.id);
                      onClose();
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px', width: '100%',
                      padding: '10px 20px', background: 'transparent', border: 'none',
                      color: '#e5e7eb', fontSize: '0.85rem', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <span style={{ fontSize: '1.1rem' }}>{action.icon}</span>
                    <span style={{ flex: 1 }}>{action.label}</span>
                    {action.dangerous && (
                      <span style={{
                        fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px',
                        background: 'rgba(239,68,68,0.15)', color: '#f87171', fontWeight: 700,
                      }}>DANGEROUS</span>
                    )}
                    <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>→</span>
                  </motion.button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: '10px 20px', borderTop: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', alignItems: 'center', gap: '16px', fontSize: '0.7rem', color: '#6b7280',
          }}>
            <span><kbd style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 4px', borderRadius: '3px', border: '1px solid rgba(255,255,255,0.1)' }}>↑↓</kbd> Navigate</span>
            <span><kbd style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 4px', borderRadius: '3px', border: '1px solid rgba(255,255,255,0.1)' }}>↵</kbd> Open</span>
            <span><kbd style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 4px', borderRadius: '3px', border: '1px solid rgba(255,255,255,0.1)' }}>Tab</kbd> Switch mode</span>
            {totalCount > 0 && <span style={{ marginLeft: 'auto' }}>{totalCount} results</span>}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
