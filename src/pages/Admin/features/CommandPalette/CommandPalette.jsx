/**
 * Phase 1: Global Command Palette — ⌘+K / Ctrl+K
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { adminApiClient } from '../../api/adminApiClient';
import { useTheme } from '../../../../context/ThemeContext';

const ENTITY_META = {
  users: { icon: '👤', label: 'Users', color: '#3b82f6', domain: 'customers', subModuleId: 'directory' },
  user: { icon: '👤', label: 'Users', color: '#3b82f6', domain: 'customers', subModuleId: 'directory' },
  bets: { icon: '🎲', label: 'Bets', color: '#f59e0b', domain: 'betting', subModuleId: 'bets-registry' },
  bet: { icon: '🎲', label: 'Bets', color: '#f59e0b', domain: 'betting', subModuleId: 'bets-registry' },
  tickets: { icon: '🎫', label: 'Tickets', color: '#8b5cf6', domain: 'support', subModuleId: 'ticket-queue' },
  ticket: { icon: '🎫', label: 'Tickets', color: '#8b5cf6', domain: 'support', subModuleId: 'ticket-queue' },
  matches: { icon: '🏏', label: 'Matches', color: '#10b981', domain: 'sports', subModuleId: 'catalog' },
  match: { icon: '🏏', label: 'Matches', color: '#10b981', domain: 'sports', subModuleId: 'catalog' },
  markets: { icon: '📊', label: 'Markets', color: '#06b6d4', domain: 'trading-risk', subModuleId: 'exposure' },
  market: { icon: '📊', label: 'Markets', color: '#06b6d4', domain: 'trading-risk', subModuleId: 'exposure' },
  transactions: { icon: '💳', label: 'Transactions', color: '#ec4899', domain: 'finance', subModuleId: 'ledger' },
  transaction: { icon: '💳', label: 'Transactions', color: '#ec4899', domain: 'finance', subModuleId: 'ledger' },
  withdrawals: { icon: '💰', label: 'Withdrawals', color: '#22c55e', domain: 'finance', subModuleId: 'maker-checker' },
  withdrawal: { icon: '💰', label: 'Withdrawals', color: '#22c55e', domain: 'finance', subModuleId: 'maker-checker' },
  kyc_cases: { icon: '🔍', label: 'KYC Cases', color: '#f97316', domain: 'customers', subModuleId: 'kyc-queue' },
  kyc_case: { icon: '🔍', label: 'KYC Cases', color: '#f97316', domain: 'customers', subModuleId: 'kyc-queue' },
  fraud_cases: { icon: '🚨', label: 'Fraud Cases', color: '#ef4444', domain: 'trading-risk', subModuleId: 'fraud-signals' },
  fraud_case: { icon: '🚨', label: 'Fraud Cases', color: '#ef4444', domain: 'trading-risk', subModuleId: 'fraud-signals' },
  incidents: { icon: '⚠️', label: 'Incidents', color: '#eab308', domain: 'control-tower', subModuleId: 'incidents' },
  incident: { icon: '⚠️', label: 'Incidents', color: '#eab308', domain: 'control-tower', subModuleId: 'incidents' },
  audit_events: { icon: '📋', label: 'Audit Events', color: '#6b7280', domain: 'security-governance', subModuleId: 'audit-trail' },
  audit_event: { icon: '📋', label: 'Audit Events', color: '#6b7280', domain: 'security-governance', subModuleId: 'audit-trail' },
};

const QUICK_ACTIONS = [
  { id: 'open_customers', label: 'Open Customers', icon: '👤', domain: 'customers', subModuleId: 'directory', allowedRoles: ['SUPER_ADMIN', 'OPERATIONS_ADMIN', 'RISK_ANALYST', 'SUPPORT_AGENT', 'FINANCE_ADMIN'] },
  { id: 'open_betting', label: 'Open Betting Registry', icon: '🎲', domain: 'betting', subModuleId: 'bets-registry', allowedRoles: ['SUPER_ADMIN', 'TRADING_ADMIN', 'RISK_ANALYST', 'SUPPORT_AGENT', 'FINANCE_ADMIN'] },
  { id: 'open_support', label: 'Open Support Queue', icon: '🎫', domain: 'support', subModuleId: 'ticket-queue', allowedRoles: ['SUPER_ADMIN', 'SUPPORT_AGENT', 'OPERATIONS_ADMIN'] },
  { id: 'open_finance', label: 'Open Finance / Withdrawals', icon: '💰', domain: 'finance', subModuleId: 'maker-checker', allowedRoles: ['SUPER_ADMIN', 'FINANCE_ADMIN'] },
  { id: 'open_trading', label: 'Open Trading & Risk', icon: '📊', domain: 'trading-risk', subModuleId: 'exposure', allowedRoles: ['SUPER_ADMIN', 'TRADING_ADMIN', 'RISK_ANALYST'] },
  { id: 'open_sports', label: 'Open Sports Catalog', icon: '🏏', domain: 'sports', subModuleId: 'catalog', allowedRoles: ['SUPER_ADMIN', 'TRADING_ADMIN', 'OPERATIONS_ADMIN'] },
  { id: 'open_iplsrl', label: 'Open OddsYra SRL Console', icon: '🏟️', domain: 'sports', subModuleId: 'iplsrl-console', allowedRoles: ['SUPER_ADMIN', 'TRADING_ADMIN', 'OPERATIONS_ADMIN'] },
  { id: 'open_audit', label: 'Open Audit Trail', icon: '📋', domain: 'security-governance', subModuleId: 'audit-trail', allowedRoles: ['SUPER_ADMIN', 'OPERATIONS_ADMIN', 'RISK_ANALYST'] },
  { id: 'open_control', label: 'Open Control Tower', icon: '📡', domain: 'control-tower', subModuleId: 'overview', allowedRoles: null },
  { id: 'open_kill_switches', label: 'Open platform kill switches', icon: '⛔', domain: 'control-tower', subModuleId: 'kill-switches', allowedRoles: ['SUPER_ADMIN', 'OPERATIONS_ADMIN'] },
  { id: 'open_api_explorer', label: 'Open API Explorer', icon: '🔌', domain: 'api-explorer', subModuleId: 'overview', allowedRoles: ['SUPER_ADMIN', 'OPERATIONS_ADMIN'] },
];

export default function CommandPalette({
  isOpen,
  onClose,
  initialQuery = '',
  onNavigate,
}) {
  const { isDark } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({});
  const [totalCount, setTotalCount] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mode, setMode] = useState('search');
  const [recentSearches, setRecentSearches] = useState([]);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  const activeRole = typeof window !== 'undefined'
    ? (localStorage.getItem('adminRole') || localStorage.getItem('oddsyra_admin_role') || 'SUPER_ADMIN')
    : 'SUPER_ADMIN';
  const availableQuickActions = QUICK_ACTIONS.filter(
    (act) => !act.allowedRoles || act.allowedRoles.includes(activeRole) || activeRole === 'SUPER_ADMIN',
  );

  const panelBg = isDark ? '#111827' : '#ffffff';
  const panelBorder = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.12)';
  const textMain = isDark ? '#f3f4f6' : '#0f172a';
  const textMuted = isDark ? '#9ca3af' : '#64748b';
  const textSoft = isDark ? '#d1d5db' : '#334155';
  const rowHover = isDark ? 'rgba(59,130,246,0.08)' : 'rgba(59,130,246,0.1)';
  const rowSelected = isDark ? 'rgba(59,130,246,0.12)' : 'rgba(59,130,246,0.14)';

  useEffect(() => {
    if (!isOpen) return undefined;
    setTimeout(() => inputRef.current?.focus(), 80);
    setQuery(initialQuery || '');
    setResults({});
    setTotalCount(0);
    setSelectedIndex(0);
    setMode('search');
    setSearchError(null);
    adminApiClient.get('/command/recent')
      .then((data) => setRecentSearches(data.recent || []))
      .catch(() => setRecentSearches([]));
    return undefined;
  }, [isOpen, initialQuery]);

  const performSearch = useCallback(async (searchQuery) => {
    if (!searchQuery || searchQuery.length < 2) {
      setResults({});
      setTotalCount(0);
      setSearchError(null);
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    try {
      const data = await adminApiClient.post('/command/search', { query: searchQuery, limit: 8 });
      setResults(data.results || {});
      setTotalCount(data.totalCount || 0);
      setSelectedIndex(0);
    } catch (err) {
      console.error('[CommandPalette] Search error:', err);
      setResults({});
      setTotalCount(0);
      setSearchError(err.message || 'Search failed');
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => performSearch(query), 220);
    return () => clearTimeout(debounceRef.current);
  }, [query, performSearch, isOpen]);

  const flatResults = [];
  Object.entries(results).forEach(([type, items]) => {
    if (items && items.length > 0) {
      items.forEach((item) => flatResults.push({ ...item, _category: type }));
    }
  });

  const handleResultClick = (item) => {
    const meta = ENTITY_META[item._category] || ENTITY_META[item._entityType];
    if (onNavigate && meta?.domain) {
      const category = String(item._category || item._entityType || '').toLowerCase();
      const isTicket = category === 'ticket' || category === 'tickets';
      const isKyc = category === 'kyc_case' || category === 'kyc_cases';
      let entityId = item._displayId;
      if (isTicket) entityId = item.conversation_id || item._displayId;
      else if (isKyc) entityId = item.user_id || item._displayId;
      onNavigate({
        domainId: meta.domain,
        subModuleId: meta.subModuleId,
        entityType: item._entityType || item._category,
        entityId,
        label: item._displayLabel,
      });
    }
    onClose();
  };

  const handleQuickAction = (action) => {
    if (onNavigate && action.domain) {
      onNavigate({
        domainId: action.domain,
        subModuleId: action.subModuleId,
        entityType: 'action',
        entityId: action.id,
        label: action.label,
      });
    }
    onClose();
  };

  useEffect(() => {
    if (!isOpen) return undefined;
    const handler = (e) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, Math.max(flatResults.length - 1, 0)));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      }
      if (e.key === 'Enter' && flatResults[selectedIndex]) {
        e.preventDefault();
        handleResultClick(flatResults[selectedIndex]);
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        setMode((m) => (m === 'search' ? 'actions' : 'search'));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, flatResults, selectedIndex, onClose]);

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
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(15,23,42,0.35)',
          backdropFilter: 'blur(8px)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
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
            width: 'min(640px, calc(100vw - 32px))',
            maxHeight: '70vh',
            background: panelBg,
            borderRadius: '16px',
            border: `1px solid ${panelBorder}`,
            boxShadow: isDark
              ? '0 25px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(59,130,246,0.15)'
              : '0 25px 60px rgba(15,23,42,0.18)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            padding: '16px 20px',
            borderBottom: `1px solid ${panelBorder}`,
            gap: '12px',
          }}>
            <span style={{ fontSize: '1.2rem', opacity: 0.5 }}>🔍</span>
            <input
              ref={inputRef}
              type="text"
              placeholder="Search users, bets, tickets, matches, markets..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: textMain,
                fontSize: '1rem',
              }}
            />
            <kbd style={{
              background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
              border: `1px solid ${panelBorder}`,
              borderRadius: '4px',
              padding: '2px 6px',
              fontSize: '0.7rem',
              color: textMuted,
            }}>
              ESC
            </kbd>
          </div>

          <div style={{ display: 'flex', borderBottom: `1px solid ${panelBorder}` }}>
            {['search', 'actions'].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                style={{
                  flex: 1,
                  padding: '8px 16px',
                  background: mode === m ? 'rgba(59,130,246,0.1)' : 'transparent',
                  border: 'none',
                  borderBottom: mode === m ? '2px solid #3b82f6' : '2px solid transparent',
                  color: mode === m ? '#60a5fa' : textMuted,
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {m === 'search' ? 'Search' : 'Quick Actions'}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', maxHeight: '50vh' }}>
            {mode === 'search' ? (
              <>
                {isSearching && (
                  <div style={{ padding: '20px', textAlign: 'center', color: textMuted, fontSize: '0.85rem' }}>
                    Searching…
                  </div>
                )}

                {searchError && (
                  <div style={{ padding: '16px 20px', color: '#f87171', fontSize: '0.85rem' }}>
                    {searchError}
                  </div>
                )}

                {!isSearching && !searchError && query.length >= 2 && totalCount === 0 && (
                  <div style={{ padding: '32px 20px', textAlign: 'center', color: textMuted }}>
                    <div style={{ fontSize: '0.9rem' }}>No results for “{query}”</div>
                    <div style={{ fontSize: '0.75rem', marginTop: '6px' }}>Try an email, mobile number, user id, bet id, or team name</div>
                  </div>
                )}

                {!isSearching && query.length < 2 && (
                  <div style={{ padding: '16px 20px', color: textMuted, fontSize: '0.82rem' }}>
                    Type at least 2 characters — search users by email or mobile, plus bets, tickets, and matches.
                  </div>
                )}

                {!isSearching && query.length < 2 && recentSearches.length > 0 && (
                  <div style={{ padding: '4px 0 12px' }}>
                    <div style={{ padding: '4px 20px 8px', fontSize: '0.7rem', fontWeight: 700, color: textMuted, textTransform: 'uppercase' }}>
                      Recent Searches
                    </div>
                    {recentSearches.slice(0, 5).map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setQuery(s.search_query)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          width: '100%',
                          padding: '8px 20px',
                          background: 'transparent',
                          border: 'none',
                          color: textSoft,
                          fontSize: '0.85rem',
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <span>{s.search_query}</span>
                        <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: textMuted }}>{s.result_count} results</span>
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
                        padding: '6px 20px',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        color: meta.color,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                      }}>
                        {meta.icon} {meta.label}
                        <span style={{ fontSize: '0.65rem', color: textMuted, fontWeight: 400 }}> ({items.length})</span>
                      </div>
                      {items.map((item, idx) => {
                        const globalIdx = flatResults.findIndex((r) => r._displayId === item._displayId && r._category === type);
                        const isSelected = globalIdx === selectedIndex;
                        return (
                          <motion.button
                            key={`${type}-${idx}`}
                            type="button"
                            onClick={() => handleResultClick({ ...item, _category: type })}
                            whileHover={{ backgroundColor: rowHover }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                              width: '100%',
                              padding: '10px 20px 10px 32px',
                              background: isSelected ? rowSelected : 'transparent',
                              border: 'none',
                              borderLeft: isSelected ? '3px solid #3b82f6' : '3px solid transparent',
                              color: textMain,
                              fontSize: '0.85rem',
                              cursor: 'pointer',
                              textAlign: 'left',
                            }}
                          >
                            <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: meta.color, minWidth: '100px' }}>
                              {item._displayId}
                            </span>
                            <span style={{ flex: 1, color: textSoft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item._displayLabel}
                            </span>
                          </motion.button>
                        );
                      })}
                    </div>
                  );
                })}
              </>
            ) : (
              <div style={{ padding: '8px 0' }}>
                {availableQuickActions.map((action) => (
                  <motion.button
                    key={action.id}
                    type="button"
                    whileHover={{ backgroundColor: rowHover }}
                    onClick={() => handleQuickAction(action)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      width: '100%',
                      padding: '10px 20px',
                      background: 'transparent',
                      border: 'none',
                      color: textMain,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ fontSize: '1.1rem' }}>{action.icon}</span>
                    <span style={{ flex: 1 }}>{action.label}</span>
                    <span style={{ fontSize: '0.7rem', color: textMuted }}>→</span>
                  </motion.button>
                ))}
              </div>
            )}
          </div>

          <div style={{
            padding: '10px 20px',
            borderTop: `1px solid ${panelBorder}`,
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            fontSize: '0.7rem',
            color: textMuted,
          }}>
            <span>↑↓ Navigate</span>
            <span>↵ Open</span>
            <span>Tab Switch</span>
            {totalCount > 0 && <span style={{ marginLeft: 'auto' }}>{totalCount} results</span>}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
