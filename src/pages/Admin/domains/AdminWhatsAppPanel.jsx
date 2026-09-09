import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import { useAdminToast } from '../components/AdminToastContext';
import { StatusBadge } from '../components/AdminBadge';
import AdminConfirmDialog from '../components/AdminConfirmDialog';
import AdminKPI from '../components/AdminKPI';
import './AdminWhatsAppPanel.css';

/**
 * WhatsApp Business Operations Control Center
 * 
 * Powered by Kapso Meta WhatsApp Cloud API Integration
 * Apple-inspired fluid design with real-time smartphone device simulator,
 * delivery telemetry, template directory, and gateway observability.
 */
export default function AdminWhatsAppPanel({ initialRecipient = '', initialUserId = '', onDismissQuickModal }) {
  const { showToast } = useAdminToast();
  const [activeTab, setActiveTab] = useState('compose'); // 'compose' | 'logs' | 'templates' | 'gateway'

  // Gateway Connection State
  const [status, setStatus] = useState({ configured: false, mode: 'LOADING' });
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [testingPing, setTestingPing] = useState(false);
  const [pingLatency, setPingLatency] = useState(null);

  // Outbound Compose State
  const [recipient, setRecipient] = useState(initialRecipient);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState(initialUserId);
  const [playerSearchQuery, setPlayerSearchQuery] = useState('');
  const [playerResults, setPlayerResults] = useState([]);
  const [searchingPlayers, setSearchingPlayers] = useState(false);

  const [messageType, setMessageType] = useState('TEMPLATE'); // 'TEMPLATE' | 'TEXT'
  const [templates, setTemplates] = useState([]);
  const [templateSearch, setTemplateSearch] = useState('');
  const [templateCategoryFilter, setTemplateCategoryFilter] = useState('ALL');
  const [selectedTemplateName, setSelectedTemplateName] = useState('');
  const [templateParams, setTemplateParams] = useState({});
  const [customBody, setCustomBody] = useState('');

  const [sending, setSending] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(false);

  // Delivery Logs State
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logFilterStatus, setLogFilterStatus] = useState('ALL');
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [stats, setStats] = useState({ total: 0, successful: 0, failed: 0 });

  const textareaRef = useRef(null);

  // 1. Fetch Kapso / Meta Gateway Status
  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    const start = performance.now();
    try {
      const data = await adminApiClient.get('/whatsapp/status');
      setStatus(data);
      setPingLatency(Math.round(performance.now() - start));
    } catch {
      setStatus({ configured: false, mode: 'MOCK_SANDBOX' });
      setPingLatency(null);
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  // 2. Fetch Templates
  const loadTemplates = useCallback(async () => {
    try {
      const data = await adminApiClient.get('/whatsapp/templates');
      const list = data.templates || [];
      setTemplates(list);
      if (list.length > 0 && !selectedTemplateName) {
        // Default to first approved utility template if available
        const defaultTmpl = list.find((t) => t.name === 'oddsyra_support_update') || list[0];
        setSelectedTemplateName(defaultTmpl.name);
      }
    } catch (err) {
      showToast(err.message || 'Failed to load WhatsApp templates', 'error');
    }
  }, [selectedTemplateName, showToast]);

  // 3. Fetch Delivery Logs
  const loadLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const params = new URLSearchParams();
      if (logFilterStatus !== 'ALL') params.set('status', logFilterStatus);
      if (logSearchQuery.trim()) params.set('recipient', logSearchQuery.trim());
      const data = await adminApiClient.get(`/whatsapp/logs?${params.toString()}`);
      setLogs(data.logs || []);
      if (data.pagination) {
        setStats({
          total: data.pagination.total || 0,
          successful: data.pagination.successful || 0,
          failed: data.pagination.failed || 0,
        });
      }
    } catch {
      setLogs([]);
    } finally {
      setLoadingLogs(false);
    }
  }, [logFilterStatus, logSearchQuery]);

  useEffect(() => {
    loadStatus();
    loadTemplates();
  }, [loadStatus, loadTemplates]);

  useEffect(() => {
    if (activeTab === 'logs') {
      loadLogs();
    }
  }, [activeTab, loadLogs]);

  // Player Autocomplete Search
  useEffect(() => {
    const q = playerSearchQuery.trim();
    if (!q || q.length < 2) {
      setPlayerResults([]);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearchingPlayers(true);
      try {
        const data = await adminApiClient.get(`/whatsapp/search-players?q=${encodeURIComponent(q)}`);
        if (!cancelled) setPlayerResults(data.players || []);
      } catch {
        if (!cancelled) setPlayerResults([]);
      } finally {
        if (!cancelled) setSearchingPlayers(false);
      }
    }, 280);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [playerSearchQuery]);

  const handleSelectPlayer = (player) => {
    setSelectedUser(player);
    setSelectedUserId(player.id);
    setRecipient(player.phone ? player.phone.replace(/\D/g, '') : '');
    setPlayerSearchQuery('');
    setPlayerResults([]);

    // Populate name parameter if template uses it
    setTemplateParams((prev) => ({
      ...prev,
      name: player.name || player.username || '',
      param_1: player.name || player.username || '',
    }));

    showToast(`Linked recipient: ${player.name || player.username}`, 'info');
  };

  const handleClearSelectedPlayer = () => {
    setSelectedUser(null);
    setSelectedUserId(null);
    setPlayerSearchQuery('');
  };

  const currentTemplate = useMemo(
    () => templates.find((t) => t.name === selectedTemplateName) || null,
    [templates, selectedTemplateName]
  );

  // Sync parameter keys when template changes
  useEffect(() => {
    if (currentTemplate?.parameters) {
      setTemplateParams((prev) => {
        const next = { ...prev };
        currentTemplate.parameters.forEach((p) => {
          if (next[p.key] === undefined) {
            next[p.key] = '';
          }
        });
        return next;
      });
    }
  }, [currentTemplate]);

  // Generate dynamic live preview text
  const previewText = useMemo(() => {
    if (messageType === 'TEXT') {
      return customBody.trim() || 'Type your message on the left to see the live WhatsApp bubble update in real-time...';
    }
    if (!currentTemplate) return 'Select a template from the menu...';
    let text = currentTemplate.sampleText || '';
    if (currentTemplate.parameters) {
      currentTemplate.parameters.forEach((param, idx) => {
        const val = templateParams[param.key];
        const placeholder = val || `[${param.label || `param_${idx + 1}`}]`;
        // Replace positional {{1}} and named {{key}}
        text = text.replaceAll(`{{${idx + 1}}}`, placeholder);
        text = text.replaceAll(`{{${param.key}}}`, placeholder);
      });
    }
    return text;
  }, [messageType, customBody, currentTemplate, templateParams]);

  // Execute Dispatch
  const handleSend = async () => {
    const rawClean = recipient.replace(/\D/g, '');
    if (!rawClean) {
      showToast('Recipient phone number is required', 'warning');
      return;
    }
    if (messageType === 'TEXT' && !customBody.trim()) {
      showToast('Message content cannot be empty', 'warning');
      return;
    }

    setSending(true);
    try {
      let payload = {
        to: rawClean,
        type: messageType,
        userId: selectedUserId || null,
      };

      if (messageType === 'TEMPLATE') {
        const paramsList = (currentTemplate?.parameters || []).map((p) => ({
          type: 'text',
          text: templateParams[p.key] || '',
        }));
        payload = {
          ...payload,
          templateName: selectedTemplateName,
          languageCode: currentTemplate?.language || 'en_US',
          parameters: paramsList,
        };
      } else {
        payload = {
          ...payload,
          body: customBody.trim(),
        };
      }

      const res = await adminApiClient.post('/whatsapp/send', payload);
      setConfirmDialog(false);

      if (res.mock) {
        showToast(`Sandbox simulation logged for ${res.recipient}`, 'info');
      } else {
        showToast(`WhatsApp message dispatched to ${res.recipient}!`, 'success');
      }

      if (messageType === 'TEXT') setCustomBody('');
      if (onDismissQuickModal) onDismissQuickModal();
      loadLogs();
    } catch (err) {
      showToast(err.message || 'Failed to dispatch WhatsApp message', 'error');
    } finally {
      setSending(false);
    }
  };

  // Keyboard shortcut: Cmd/Ctrl + Enter sends
  const handleKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!sending && recipient.trim()) {
        setConfirmDialog(true);
      }
    }
  };

  // Quick Preset Prompts for Direct Messaging
  const quickPrompts = [
    { label: '💸 Withdrawal Paid', text: 'Hello! Your withdrawal of ₹5,000 has been processed successfully via IMPS. Thank you for choosing OddsYra.' },
    { label: '🆔 KYC Verification', text: 'Hi! To complete your OddsYra account verification and unlock full withdrawals, please upload your Aadhaar/PAN in profile.' },
    { label: '🎁 VIP Perk Active', text: 'Exclusive VIP alert: A 20% deposit boost bonus is waiting on your account. Log in to claim before expiry!' },
    { label: '🏏 Match Live Notice', text: 'Live cricket markets are open with boosted odds for tonight\'s clash. Place your bets in-play now!' }
  ];

  // Filtered Templates for Directory
  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      const matchesCat = templateCategoryFilter === 'ALL' || t.category === templateCategoryFilter;
      const q = templateSearch.toLowerCase().trim();
      const matchesQuery = !q || t.name.toLowerCase().includes(q) || (t.label && t.label.toLowerCase().includes(q)) || (t.description && t.description.toLowerCase().includes(q));
      return matchesCat && matchesQuery;
    });
  }, [templates, templateCategoryFilter, templateSearch]);

  const deliverySuccessRate = stats.total > 0
    ? `${((stats.successful / stats.total) * 100).toFixed(1)}%`
    : '100%';

  return (
    <div className="whatsapp-ops-hub" onKeyDown={handleKeyDown}>
      {/* ── TOP HEADER BANNER ── */}
      <div className="wa-header-banner">
        <div className="wa-header-left">
          <div className="wa-icon-badge">💬</div>
          <div>
            <h3 className="wa-header-title">
              WhatsApp Business Messenger
              <span style={{ fontSize: '0.74rem', background: 'rgba(37,211,102,0.15)', color: '#25D366', padding: '2px 8px', borderRadius: '6px', fontWeight: 600 }}>
                Meta Cloud API
              </span>
            </h3>
            <p className="wa-header-subtitle">
              <span>Direct outreach, verification nudges, and player notifications via official WhatsApp BSP (Kapso)</span>
            </p>
          </div>
        </div>

        <div className="wa-header-actions">
          {loadingStatus ? (
            <div className="wa-status-pill wa-status-pill--sandbox">
              <span className="wa-pulse-dot wa-pulse-dot--sandbox" />
              <span>Verifying Meta Connection...</span>
            </div>
          ) : status.configured ? (
            <div className="wa-status-pill wa-status-pill--live" title={`WABA: ${status.businessAccountId || 'Ready'}`}>
              <span className="wa-pulse-dot wa-pulse-dot--live" />
              <span>Oddsyra Official Connected</span>
              <span style={{ opacity: 0.7, fontFamily: 'var(--font-mono, monospace)' }}>
                {status.phoneNumberId ? `(${status.phoneNumberId})` : ''}
              </span>
            </div>
          ) : (
            <div className="wa-status-pill wa-status-pill--sandbox" title="Configure credentials in .env to activate live dispatch">
              <span className="wa-pulse-dot wa-pulse-dot--sandbox" />
              <span>Sandbox Simulation Mode</span>
            </div>
          )}

          <button
            type="button"
            onClick={loadStatus}
            disabled={loadingStatus}
            className="admin-btn admin-btn--secondary admin-btn--sm"
            title="Refresh connection status and measure gateway ping"
          >
            {loadingStatus ? 'Checking...' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {/* ── TELEMETRY KPI CARDS ── */}
      <div className="wa-kpi-grid">
        <AdminKPI
          label="Total Dispatched"
          value={stats.total}
          trend={stats.total > 0 ? 'up' : null}
          trendLabel="Audit Verified"
          accent="#3b82f6"
          icon="💬"
          onClick={() => setActiveTab('logs')}
        />
        <AdminKPI
          label="Delivery Success Rate"
          value={deliverySuccessRate}
          trend="up"
          trendLabel={`${stats.successful} Delivered`}
          accent="#10b981"
          icon="🚀"
          onClick={() => setActiveTab('logs')}
        />
        <AdminKPI
          label="Approved Meta Templates"
          value={templates.length}
          trendLabel="Utility & Marketing"
          accent="#8b5cf6"
          icon="📑"
          onClick={() => setActiveTab('templates')}
        />
        <AdminKPI
          label="Customer Care Window"
          value={status.configured ? 'Active (24h Open)' : 'Sandbox'}
          trendLabel={pingLatency ? `${pingLatency}ms Meta Latency` : 'Cloud API Ready'}
          accent="#10b981"
          icon="⚡"
          onClick={() => setActiveTab('gateway')}
        />
      </div>

      {/* ── SEGMENTED SUBTAB NAVIGATION ── */}
      <div className="wa-nav-bar">
        <button
          type="button"
          onClick={() => setActiveTab('compose')}
          className={`wa-nav-tab ${activeTab === 'compose' ? 'wa-nav-tab--active' : ''}`}
        >
          ✉️ Outbound Dispatcher
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('logs')}
          className={`wa-nav-tab ${activeTab === 'logs' ? 'wa-nav-tab--active' : ''}`}
        >
          📋 Delivery Logs ({stats.total})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('templates')}
          className={`wa-nav-tab ${activeTab === 'templates' ? 'wa-nav-tab--active' : ''}`}
        >
          📑 Template Library ({templates.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('gateway')}
          className={`wa-nav-tab ${activeTab === 'gateway' ? 'wa-nav-tab--active' : ''}`}
        >
          ⚙️ Gateway & WABA Health
        </button>
      </div>

      {/* ── TAB 1: OUTBOUND COMPOSER & SMARTPHONE SIMULATOR ── */}
      {activeTab === 'compose' && (
        <div className="wa-compose-grid">
          {/* Left Column: Form Controls */}
          <div className="wa-card">
            <div className="wa-card-header">
              <h4 className="wa-card-title">
                <span>🚀 Outbound Message Composer</span>
              </h4>
              <span style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>
                Press <kbd style={{ padding: '2px 5px', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', fontSize: '0.72rem' }}>⌘ Enter</kbd> to send
              </span>
            </div>

            {/* Recipient Search & Autocomplete */}
            <div className="wa-field-group">
              <label className="wa-field-label">
                <span>1. Select Player (Optional CRM Link)</span>
                {searchingPlayers && <span style={{ color: 'var(--admin-text-muted)', fontSize: '0.72rem' }}>Searching...</span>}
              </label>

              <div className="wa-player-search-wrapper">
                <span className="wa-player-search-icon">🔍</span>
                <input
                  type="text"
                  placeholder="Type username, customer name, email or phone..."
                  value={playerSearchQuery}
                  onChange={(e) => setPlayerSearchQuery(e.target.value)}
                  className="wa-player-search-input"
                />

                {playerResults.length > 0 && (
                  <div className="wa-player-dropdown">
                    {playerResults.map((p) => (
                      <div
                        key={p.id}
                        className="wa-player-row"
                        onClick={() => handleSelectPlayer(p)}
                      >
                        <div className="wa-player-info">
                          <div className="wa-player-avatar">
                            {(p.name || p.username || 'P')[0].toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--admin-text)' }}>
                              {p.name || p.username}
                              {p.vipTier && p.vipTier !== 'STANDARD' && (
                                <span style={{ marginLeft: '6px', fontSize: '0.68rem', padding: '1px 5px', borderRadius: '4px', background: '#7c3aed22', color: '#c4b5fd', fontWeight: 700 }}>
                                  {p.vipTier}
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)' }}>
                              {p.email} • {p.kycStatus || 'KYC UNVERIFIED'}
                            </div>
                          </div>
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.8rem', color: p.phone ? '#34d399' : '#f87171' }}>
                          {p.phone || 'No phone'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedUser && (
                <div className="wa-selected-player-chip">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div className="wa-player-avatar" style={{ width: '26px', height: '26px', fontSize: '0.7rem' }}>
                      {(selectedUser.name || selectedUser.username || 'P')[0].toUpperCase()}
                    </div>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                      {selectedUser.name || selectedUser.username}
                    </span>
                    <span style={{ fontSize: '0.74rem', color: 'var(--admin-text-muted)' }}>
                      ({selectedUser.phone})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleClearSelectedPlayer}
                    style={{ background: 'none', border: 'none', color: 'var(--admin-text-muted)', cursor: 'pointer', fontSize: '0.85rem' }}
                    title="Unlink player"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            {/* Recipient Phone Number */}
            <div className="wa-field-group">
              <label className="wa-field-label">
                <span>2. Recipient WhatsApp Phone Number *</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)' }}>E.164 Format</span>
              </label>

              <div className="wa-phone-affix-group">
                <div className="wa-phone-prefix">
                  <span>🇮🇳</span>
                  <span>+91</span>
                </div>
                <input
                  type="text"
                  placeholder="94945 10400"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  className="wa-phone-input"
                />
              </div>
            </div>

            {/* Message Dispatch Type Selector */}
            <div className="wa-field-group">
              <label className="wa-field-label">
                <span>3. Message Dispatch Type</span>
              </label>

              <div className="wa-type-toggle">
                <label className={`wa-type-card ${messageType === 'TEMPLATE' ? 'wa-type-card--selected' : ''}`}>
                  <input
                    type="radio"
                    name="waMsgType"
                    checked={messageType === 'TEMPLATE'}
                    onChange={() => setMessageType('TEMPLATE')}
                    className="wa-type-radio"
                  />
                  <div>
                    <div style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--admin-text)' }}>
                      Meta Approved Template
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)', marginTop: '2px' }}>
                      Bypasses 24h window (Recommended for business outreach)
                    </div>
                  </div>
                </label>

                <label className={`wa-type-card ${messageType === 'TEXT' ? 'wa-type-card--selected' : ''}`}>
                  <input
                    type="radio"
                    name="waMsgType"
                    checked={messageType === 'TEXT'}
                    onChange={() => setMessageType('TEXT')}
                    className="wa-type-radio"
                  />
                  <div>
                    <div style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--admin-text)' }}>
                      Direct Text Message
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)', marginTop: '2px' }}>
                      Requires active 24h conversation with player
                    </div>
                  </div>
                </label>
              </div>
            </div>

            {/* Template Parameter Controls */}
            {messageType === 'TEMPLATE' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', background: 'rgba(0,0,0,0.18)', padding: '16px', borderRadius: '12px', border: '1px solid var(--admin-border, #334155)' }}>
                <div className="wa-field-group">
                  <label className="wa-field-label">
                    <span>Select WhatsApp Template</span>
                    {currentTemplate && (
                      <span className="wa-param-badge">
                        {currentTemplate.category} • {currentTemplate.language || 'en_US'}
                      </span>
                    )}
                  </label>
                  <select
                    value={selectedTemplateName}
                    onChange={(e) => setSelectedTemplateName(e.target.value)}
                    className="admin-input admin-select"
                    style={{ width: '100%', borderRadius: '10px' }}
                  >
                    {templates.map((t) => (
                      <option key={t.name} value={t.name}>
                        {t.label || t.name} [{t.category}]
                      </option>
                    ))}
                  </select>
                </div>

                {/* Dynamic Parameter Fields */}
                {currentTemplate?.parameters && currentTemplate.parameters.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
                    <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--admin-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Template Placeholders
                    </div>
                    {currentTemplate.parameters.map((param, idx) => (
                      <div key={param.key} className="wa-field-group">
                        <label className="wa-field-label" style={{ fontSize: '0.74rem' }}>
                          <span>{param.label || `Parameter {{${idx + 1}}}`}</span>
                          <span style={{ fontFamily: 'var(--font-mono, monospace)', color: '#60a5fa' }}>{`{{${param.key}}}`}</span>
                        </label>
                        <input
                          type="text"
                          placeholder={param.placeholder || `Value for ${param.key}`}
                          value={templateParams[param.key] || ''}
                          onChange={(e) =>
                            setTemplateParams((prev) => ({ ...prev, [param.key]: e.target.value }))
                          }
                          className="admin-input"
                          style={{ width: '100%', borderRadius: '8px', fontSize: '0.84rem' }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Direct Free-Text Controls */}
            {messageType === 'TEXT' && (
              <div className="wa-field-group">
                <label className="wa-field-label">
                  <span>Message Content *</span>
                  <span style={{ fontSize: '0.72rem', color: customBody.length > 3900 ? '#f87171' : 'var(--admin-text-muted)' }}>
                    {customBody.length} / 4096 characters
                  </span>
                </label>

                <textarea
                  ref={textareaRef}
                  rows={4}
                  placeholder="Type your WhatsApp message to the player..."
                  value={customBody}
                  onChange={(e) => setCustomBody(e.target.value)}
                  className="admin-input"
                  style={{ width: '100%', borderRadius: '10px', minHeight: '110px', padding: '12px' }}
                />

                <div className="wa-prompt-chips">
                  <span style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)', display: 'flex', alignItems: 'center', marginRight: '4px' }}>
                    Quick chips:
                  </span>
                  {quickPrompts.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setCustomBody(p.text)}
                      className="wa-prompt-chip"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Dispatch Button */}
            <button
              type="button"
              onClick={() => setConfirmDialog(true)}
              disabled={sending || !recipient.trim()}
              className="wa-send-btn"
            >
              {sending ? (
                <>
                  <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>↻</span>
                  <span>Dispatching via Kapso Cloud API...</span>
                </>
              ) : (
                <>
                  <span>💬</span>
                  <span>Dispatch WhatsApp Message</span>
                </>
              )}
            </button>
          </div>

          {/* Right Column: Ultra-Realistic Smartphone Simulator */}
          <div className="wa-card" style={{ padding: '20px' }}>
            <div className="wa-card-header" style={{ marginBottom: '14px' }}>
              <h4 className="wa-card-title">
                <span>📱 Live WhatsApp Chat Simulator</span>
              </h4>
              <span style={{ fontSize: '0.72rem', background: '#05966922', color: '#34d399', padding: '2px 8px', borderRadius: '9999px', fontWeight: 600 }}>
                Real-Time Preview
              </span>
            </div>

            {/* Phone Bezel / Frame */}
            <div className="wa-phone-device">
              <div className="wa-phone-screen">
                {/* Dynamic Island Notch */}
                <div className="wa-phone-island">
                  <div className="wa-phone-camera" />
                </div>

                {/* Status Bar */}
                <div className="wa-phone-status-bar">
                  <span>9:41</span>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span>5G</span>
                    <span>100%</span>
                  </div>
                </div>

                {/* WhatsApp Chat Top Header */}
                <div className="wa-chat-header">
                  <span style={{ color: '#00a884', fontSize: '1.2rem', marginRight: '2px', cursor: 'pointer' }}>‹</span>
                  <div className="wa-chat-header-avatar">
                    OY
                    <span className="wa-verified-badge">✓</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="wa-chat-header-title">
                      <span>OddsYra Official</span>
                      <span style={{ color: '#00a884', fontSize: '0.8rem' }}>✓</span>
                    </div>
                    <div className="wa-chat-header-sub">
                      {status.configured ? 'Verified Business Account' : 'Sandbox Simulator'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '14px', color: '#aebac1', fontSize: '1rem' }}>
                    <span>📹</span>
                    <span>📞</span>
                  </div>
                </div>

                {/* Chat Canvas with Wallpaper */}
                <div className="wa-chat-body">
                  <div className="wa-date-chip">Today</div>

                  {/* Outgoing Message Bubble */}
                  <div className="wa-bubble-out">
                    <div>{previewText}</div>
                    <div className="wa-bubble-meta">
                      <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="wa-double-check">✓✓</span>
                    </div>
                  </div>
                </div>

                {/* Phone Bottom Bar */}
                <div className="wa-phone-bottom-bar">
                  <span style={{ fontSize: '1.1rem', color: '#8696a0' }}>😊</span>
                  <div className="wa-phone-recipient-tag">
                    <span>To:</span>
                    <span style={{ fontFamily: 'var(--font-mono, monospace)', color: '#e9edef', fontWeight: 600 }}>
                      {recipient.trim() ? `+91 ${recipient.trim()}` : '+91 ••••• •••••'}
                    </span>
                  </div>
                  <span style={{ fontSize: '1.1rem', color: '#8696a0' }}>📎</span>
                  <span style={{ fontSize: '1.1rem', color: '#8696a0' }}>🎤</span>
                </div>
              </div>
            </div>

            <p style={{ margin: '12px 0 0', fontSize: '0.74rem', color: 'var(--admin-text-muted)', textAlign: 'center', lineHeight: '1.4' }}>
              🛡️ End-to-end encrypted dispatch via Meta Graph v24.0. Guaranteed delivery reports with audit correlation.
            </p>
          </div>
        </div>
      )}

      {/* ── TAB 2: DELIVERY LOGS ── */}
      {activeTab === 'logs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Filters Bar */}
          <div
            style={{
              display: 'flex',
              gap: '12px',
              alignItems: 'center',
              flexWrap: 'wrap',
              background: 'var(--admin-surface, #1e293b)',
              padding: '14px 18px',
              borderRadius: '12px',
              border: '1px solid var(--admin-border, #334155)',
            }}
          >
            <input
              type="text"
              placeholder="Search recipient phone number..."
              value={logSearchQuery}
              onChange={(e) => setLogSearchQuery(e.target.value)}
              className="admin-input"
              style={{ width: '260px', borderRadius: '8px' }}
            />

            <select
              value={logFilterStatus}
              onChange={(e) => setLogFilterStatus(e.target.value)}
              className="admin-input admin-select"
              style={{ width: '170px', borderRadius: '8px' }}
            >
              <option value="ALL">All Delivery Statuses</option>
              <option value="SENT">SENT (Meta Dispatched)</option>
              <option value="DELIVERED">DELIVERED</option>
              <option value="FAILED">FAILED</option>
              <option value="MOCK_SENT">MOCK_SENT (Sandbox)</option>
            </select>

            <button
              type="button"
              onClick={loadLogs}
              disabled={loadingLogs}
              className="admin-btn admin-btn--secondary admin-btn--sm"
            >
              {loadingLogs ? 'Loading...' : 'Apply Filters'}
            </button>
          </div>

          <AdminDataTable
            title="Audit Logged WhatsApp Dispatches"
            emptyMessage="No WhatsApp messages dispatched yet"
            data={logs}
            columns={[
              {
                header: 'Message ID',
                key: 'id',
                render: (r) => (
                  <span className="admin-text-mono" style={{ fontSize: '0.74rem', color: 'var(--admin-text-muted)' }}>
                    {r.id}
                  </span>
                ),
              },
              {
                header: 'Recipient Phone',
                key: 'recipientPhone',
                render: (r) => (
                  <span className="admin-text-mono" style={{ fontWeight: 700, color: '#34d399' }}>
                    +{r.recipientPhone}
                  </span>
                ),
              },
              {
                header: 'Type / Template',
                key: 'templateName',
                render: (r) => (
                  <div>
                    <span className="admin-badge admin-badge--neutral" style={{ marginRight: '6px' }}>
                      {r.messageType}
                    </span>
                    {r.templateName && (
                      <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--admin-text)' }}>
                        {r.templateName}
                      </span>
                    )}
                  </div>
                ),
              },
              {
                header: 'Message Body',
                key: 'messageBody',
                render: (r) => (
                  <span
                    style={{
                      maxWidth: '320px',
                      display: 'inline-block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontSize: '0.8rem',
                      color: 'var(--admin-text-secondary)',
                    }}
                    title={r.messageBody}
                  >
                    {r.messageBody}
                  </span>
                ),
              },
              {
                header: 'Status',
                key: 'status',
                render: (r) => <StatusBadge status={r.status} />,
              },
              {
                header: 'Admin Actor',
                key: 'adminId',
                render: (r) => <span style={{ fontSize: '0.76rem' }}>{r.adminId}</span>,
              },
              {
                header: 'Dispatched At',
                key: 'createdAt',
                render: (r) => (
                  <span style={{ fontSize: '0.76rem', color: 'var(--admin-text-muted)' }}>
                    {r.createdAt ? new Date(r.createdAt).toLocaleString() : '—'}
                  </span>
                ),
              },
              {
                header: 'Action',
                key: 'action',
                sortable: false,
                render: (r) => (
                  <button
                    type="button"
                    onClick={() => {
                      setRecipient(r.recipientPhone);
                      setActiveTab('compose');
                      showToast(`Loaded recipient ${r.recipientPhone}`, 'info');
                    }}
                    className="admin-btn admin-btn--secondary admin-btn--sm"
                    style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                  >
                    Compose →
                  </button>
                ),
              },
            ]}
          />
        </div>
      )}

      {/* ── TAB 3: TEMPLATE DIRECTORY ── */}
      {activeTab === 'templates' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Search & Category Filter */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
              background: 'var(--admin-surface, #1e293b)',
              padding: '14px 18px',
              borderRadius: '12px',
              border: '1px solid var(--admin-border, #334155)',
            }}
          >
            <input
              type="text"
              placeholder="Search templates by name or keyword..."
              value={templateSearch}
              onChange={(e) => setTemplateSearch(e.target.value)}
              className="admin-input"
              style={{ width: '280px', borderRadius: '8px' }}
            />

            <div style={{ display: 'flex', gap: '8px' }}>
              {['ALL', 'UTILITY', 'MARKETING'].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setTemplateCategoryFilter(cat)}
                  className="admin-btn admin-btn--sm"
                  style={{
                    borderRadius: '9999px',
                    background: templateCategoryFilter === cat ? 'var(--admin-primary, #3b82f6)' : 'transparent',
                    color: templateCategoryFilter === cat ? '#ffffff' : 'var(--admin-text-muted)',
                    border: '1px solid var(--admin-border, #334155)',
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="wa-templates-grid">
            {filteredTemplates.map((t) => (
              <div key={t.name} className="wa-template-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 600, color: 'var(--admin-text)' }}>
                      {t.label || t.name}
                    </h4>
                    <span className="admin-text-mono" style={{ fontSize: '0.74rem', color: 'var(--admin-text-muted)' }}>
                      {t.name}
                    </span>
                  </div>
                  <span
                    className="admin-badge"
                    style={{
                      background: t.category === 'MARKETING' ? 'rgba(236, 72, 153, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                      color: t.category === 'MARKETING' ? '#f472b6' : '#60a5fa',
                    }}
                  >
                    {t.category}
                  </span>
                </div>

                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--admin-text-secondary)' }}>
                  {t.description}
                </p>

                <div className="wa-template-sample-box">
                  "{t.sampleText}"
                </div>

                {t.parameters && t.parameters.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {t.parameters.map((param) => (
                      <span key={param.key} className="wa-param-badge">
                        {param.label || param.key}
                      </span>
                    ))}
                  </div>
                )}

                <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end', paddingTop: '8px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTemplateName(t.name);
                      setMessageType('TEMPLATE');
                      setActiveTab('compose');
                      showToast(`Loaded template: ${t.label || t.name}`, 'info');
                    }}
                    className="admin-btn admin-btn--primary admin-btn--sm"
                    style={{ background: '#25d366', color: '#0b2e13', border: 'none', fontWeight: 600 }}
                  >
                    Use in Composer →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TAB 4: GATEWAY & WABA HEALTH ── */}
      {activeTab === 'gateway' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="wa-card">
            <div className="wa-card-header">
              <h4 className="wa-card-title">
                <span>⚙️ Meta Cloud API Infrastructure & Configuration</span>
              </h4>
              <button
                type="button"
                onClick={async () => {
                  setTestingPing(true);
                  const start = performance.now();
                  try {
                    await adminApiClient.get('/whatsapp/status');
                    setPingLatency(Math.round(performance.now() - start));
                    showToast('Meta Cloud API Gateway is fully operational!', 'success');
                  } catch (err) {
                    showToast(err.message || 'Ping failed', 'error');
                  } finally {
                    setTestingPing(false);
                  }
                }}
                disabled={testingPing}
                className="admin-btn admin-btn--secondary admin-btn--sm"
              >
                {testingPing ? 'Testing...' : '⚡ Ping Gateway'}
              </button>
            </div>

            <div className="wa-gateway-matrix">
              <div className="wa-gateway-item">
                <span className="wa-gateway-label">Verified Display Name</span>
                <span className="wa-gateway-value" style={{ color: '#34d399' }}>Oddsyra Official ✓</span>
              </div>
              <div className="wa-gateway-item">
                <span className="wa-gateway-label">Display Phone Number</span>
                <span className="wa-gateway-value" style={{ fontFamily: 'var(--font-mono, monospace)' }}>+1 555-307-2359</span>
              </div>
              <div className="wa-gateway-item">
                <span className="wa-gateway-label">Meta Phone Number ID</span>
                <span className="wa-gateway-value" style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                  {status.phoneNumberId || '1369335159587862'}
                </span>
              </div>
              <div className="wa-gateway-item">
                <span className="wa-gateway-label">Meta WABA ID (Business Account)</span>
                <span className="wa-gateway-value" style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                  {status.businessAccountId || '1392195342349739'}
                </span>
              </div>
              <div className="wa-gateway-item">
                <span className="wa-gateway-label">Messaging Throughput Tier</span>
                <span className="wa-gateway-value" style={{ color: '#60a5fa' }}>STANDARD (Tier 250 / Day)</span>
              </div>
              <div className="wa-gateway-item">
                <span className="wa-gateway-label">Webhook Receiver Endpoint</span>
                <span className="wa-gateway-value" style={{ fontSize: '0.78rem' }}>
                  https://meta-webhooks.kapso.ai/whatsapp
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CONFIRMATION DIALOG ── */}
      <AdminConfirmDialog
        isOpen={confirmDialog}
        title="Confirm WhatsApp Outbound Message"
        message={`Are you sure you want to dispatch this WhatsApp message to +${recipient.replace(/\D/g, '')}? It will be officially sent via Meta Cloud API and recorded in the admin audit trail.`}
        confirmLabel={sending ? 'Dispatching...' : 'Confirm & Dispatch'}
        cancelLabel="Cancel"
        loading={sending}
        onCancel={() => setConfirmDialog(false)}
        onConfirm={handleSend}
      />
    </div>
  );
}
