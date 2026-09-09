import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import { useAdminToast } from '../components/AdminToastContext';
import { StatusBadge } from '../components/AdminBadge';
import AdminConfirmDialog from '../components/AdminConfirmDialog';

export default function AdminWhatsAppPanel({ initialRecipient = '', initialUserId = '', onDismissQuickModal }) {
  const { showToast } = useAdminToast();
  const [activeTab, setActiveTab] = useState('compose');
  const [status, setStatus] = useState({ configured: false, mode: 'LOADING' });
  const [loadingStatus, setLoadingStatus] = useState(true);

  // Compose State
  const [recipient, setRecipient] = useState(initialRecipient);
  const [selectedUserId, setSelectedUserId] = useState(initialUserId);
  const [playerSearchQuery, setPlayerSearchQuery] = useState('');
  const [playerResults, setPlayerResults] = useState([]);
  const [searchingPlayers, setSearchingPlayers] = useState(false);

  const [messageType, setMessageType] = useState('TEMPLATE'); // 'TEMPLATE' or 'TEXT'
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateName, setSelectedTemplateName] = useState('');
  const [templateParams, setTemplateParams] = useState({});
  const [customBody, setCustomBody] = useState('');

  const [sending, setSending] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(false);

  // Logs State
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logFilterStatus, setLogFilterStatus] = useState('ALL');
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [stats, setStats] = useState({ total: 0, successful: 0, failed: 0 });

  // 1. Fetch Kapso Status
  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const data = await adminApiClient.get('/whatsapp/status');
      setStatus(data);
    } catch {
      setStatus({ configured: false, mode: 'MOCK_SANDBOX' });
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
        setSelectedTemplateName(list[0].name);
      }
    } catch (err) {
      showToast(err.message || 'Failed to load templates', 'error');
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
    if (!playerSearchQuery || playerSearchQuery.length < 2) {
      setPlayerResults([]);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearchingPlayers(true);
      try {
        const data = await adminApiClient.get(`/whatsapp/search-players?q=${encodeURIComponent(playerSearchQuery)}`);
        if (!cancelled) setPlayerResults(data.players || []);
      } catch {
        if (!cancelled) setPlayerResults([]);
      } finally {
        if (!cancelled) setSearchingPlayers(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [playerSearchQuery]);

  const handleSelectPlayer = (player) => {
    setRecipient(player.phone || '');
    setSelectedUserId(player.id);
    setPlayerSearchQuery('');
    setPlayerResults([]);
    // Pre-populate name param if template supports it
    setTemplateParams((prev) => ({
      ...prev,
      name: player.name || player.username || '',
    }));
    showToast(`Selected ${player.name || player.username} (${player.phone || 'No phone'})`, 'info');
  };

  const currentTemplate = useMemo(
    () => templates.find((t) => t.name === selectedTemplateName) || null,
    [templates, selectedTemplateName]
  );

  // Initialize template params when template changes
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

  // Generate live preview text
  const previewText = useMemo(() => {
    if (messageType === 'TEXT') {
      return customBody.trim() || 'Type your message above to see a live preview...';
    }
    if (!currentTemplate) return 'Select a template...';
    let text = currentTemplate.sampleText || '';
    Object.entries(templateParams).forEach(([key, val]) => {
      text = text.replaceAll(`{{${key}}}`, val || `[${key}]`);
    });
    return text;
  }, [messageType, customBody, currentTemplate, templateParams]);

  const handleSend = async () => {
    if (!recipient.trim()) {
      showToast('Recipient phone number is required', 'warning');
      return;
    }
    if (messageType === 'TEXT' && !customBody.trim()) {
      showToast('Message body cannot be empty', 'warning');
      return;
    }

    setSending(true);
    try {
      let payload = {
        to: recipient.trim(),
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
          languageCode: currentTemplate?.language || 'en',
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
        showToast(`Sandbox WhatsApp simulated for ${res.recipient}`, 'info');
      } else {
        showToast(`WhatsApp dispatched successfully to ${res.recipient}`, 'success');
      }

      // Reset fields if desired
      if (messageType === 'TEXT') setCustomBody('');
      if (onDismissQuickModal) onDismissQuickModal();
      if (activeTab === 'logs') loadLogs();
    } catch (err) {
      showToast(err.message || 'Failed to dispatch WhatsApp message', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="admin-whatsapp-hub" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Banner & Status Header */}
      <div
        className="admin-card"
        style={{
          padding: '16px 20px',
          background: 'var(--admin-bg-surface, #1e293b)',
          border: '1px solid var(--admin-border, #334155)',
          borderRadius: '12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: '#25D36622',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.4rem',
            }}
          >
            💬
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--admin-text-primary, #f8fafc)' }}>
              WhatsApp Business Messenger (Kapso)
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: 'var(--admin-text-muted, #94a3b8)' }}>
              Direct player outreach, verification prompts, and support updates via WhatsApp Cloud API
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {loadingStatus ? (
            <span style={{ fontSize: '0.82rem', color: 'var(--admin-text-muted)' }}>Checking connection...</span>
          ) : status.configured ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                borderRadius: '20px',
                background: '#05966922',
                border: '1px solid #05966966',
                color: '#34d399',
                fontSize: '0.82rem',
                fontWeight: 600,
              }}
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
              Live Connected ({status.phoneNumberId || 'Phone Ready'})
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                borderRadius: '20px',
                background: '#d9770622',
                border: '1px solid #d9770666',
                color: '#fbbf24',
                fontSize: '0.82rem',
                fontWeight: 600,
              }}
              title="Add KAPSO_API_KEY and KAPSO_PHONE_NUMBER_ID to .env to activate live delivery"
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b' }} />
              Sandbox / Mock Mode
            </div>
          )}
          <button
            type="button"
            onClick={loadStatus}
            className="admin-btn admin-btn--secondary admin-btn--sm"
            style={{ padding: '6px 12px' }}
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Internal Navigation Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--admin-border, #334155)', paddingBottom: '8px' }}>
        {[
          { id: 'compose', label: '✉️ Compose Message' },
          { id: 'logs', label: `📋 Delivery Logs (${stats.total})` },
          { id: 'templates', label: `📑 Approved Templates (${templates.length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === tab.id ? 'var(--admin-primary, #3b82f6)' : 'transparent',
              color: activeTab === tab.id ? '#ffffff' : 'var(--admin-text-muted, #94a3b8)',
              fontWeight: activeTab === tab.id ? 600 : 500,
              cursor: 'pointer',
              fontSize: '0.86rem',
              transition: 'all 0.15s ease',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: COMPOSE */}
      {activeTab === 'compose' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(350px, 1.4fr) minmax(320px, 1fr)', gap: '24px' }}>
          {/* Form Side */}
          <div
            className="admin-card"
            style={{
              padding: '24px',
              background: 'var(--admin-bg-surface, #1e293b)',
              border: '1px solid var(--admin-border, #334155)',
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '18px',
            }}
          >
            <h4 style={{ margin: 0, fontSize: '1rem', color: 'var(--admin-text-primary, #f8fafc)' }}>
              Outbound WhatsApp Dispatcher
            </h4>

            {/* Recipient Lookup */}
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px', color: 'var(--admin-text-secondary)' }}>
                Search & Select Player (Optional)
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="Type player username, name, email or phone..."
                  value={playerSearchQuery}
                  onChange={(e) => setPlayerSearchQuery(e.target.value)}
                  className="admin-input"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px' }}
                />
                {searchingPlayers && (
                  <span style={{ position: 'absolute', right: '12px', top: '10px', fontSize: '0.78rem', color: 'var(--admin-text-muted)' }}>
                    Searching...
                  </span>
                )}
                {playerResults.length > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      zIndex: 30,
                      background: 'var(--admin-bg-surface, #1e293b)',
                      border: '1px solid var(--admin-border, #334155)',
                      borderRadius: '8px',
                      marginTop: '4px',
                      boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                      maxHeight: '220px',
                      overflowY: 'auto',
                    }}
                  >
                    {playerResults.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => handleSelectPlayer(p)}
                        style={{
                          padding: '8px 12px',
                          borderBottom: '1px solid var(--admin-border, #334155)',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: '0.84rem',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <div>
                          <strong style={{ color: 'var(--admin-text-primary)' }}>{p.name || p.username}</strong>
                          <span style={{ marginLeft: '8px', color: 'var(--admin-text-muted)', fontSize: '0.76rem' }}>
                            {p.email}
                          </span>
                        </div>
                        <span style={{ fontFamily: 'monospace', color: p.phone ? '#34d399' : '#f87171' }}>
                          {p.phone || 'No phone'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Recipient Phone Number */}
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px', color: 'var(--admin-text-secondary)' }}>
                Recipient Phone Number (E.164 with Country Code) *
              </label>
              <input
                type="text"
                placeholder="e.g. +91 98765 43210 or 919876543210"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className="admin-input"
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', fontFamily: 'monospace' }}
              />
              <span style={{ fontSize: '0.74rem', color: 'var(--admin-text-muted)', display: 'block', marginTop: '4px' }}>
                10-digit numbers automatically prefix with India country code (+91).
              </span>
            </div>

            {/* Message Type Selector */}
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '8px', color: 'var(--admin-text-secondary)' }}>
                Message Dispatch Type
              </label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <label
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: `1px solid ${messageType === 'TEMPLATE' ? 'var(--admin-primary, #3b82f6)' : 'var(--admin-border, #334155)'}`,
                    background: messageType === 'TEMPLATE' ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.84rem',
                    color: messageType === 'TEMPLATE' ? '#93c5fd' : 'var(--admin-text-muted)',
                  }}
                >
                  <input
                    type="radio"
                    name="msgType"
                    checked={messageType === 'TEMPLATE'}
                    onChange={() => setMessageType('TEMPLATE')}
                  />
                  <span>
                    <strong>Meta Approved Template</strong>
                    <span style={{ display: 'block', fontSize: '0.72rem', opacity: 0.8 }}>
                      Recommended (No 24h limit)
                    </span>
                  </span>
                </label>

                <label
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: `1px solid ${messageType === 'TEXT' ? 'var(--admin-primary, #3b82f6)' : 'var(--admin-border, #334155)'}`,
                    background: messageType === 'TEXT' ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.84rem',
                    color: messageType === 'TEXT' ? '#93c5fd' : 'var(--admin-text-muted)',
                  }}
                >
                  <input
                    type="radio"
                    name="msgType"
                    checked={messageType === 'TEXT'}
                    onChange={() => setMessageType('TEXT')}
                  />
                  <span>
                    <strong>Direct Text</strong>
                    <span style={{ display: 'block', fontSize: '0.72rem', opacity: 0.8 }}>
                      Active customer care window
                    </span>
                  </span>
                </label>
              </div>
            </div>

            {/* Template Form */}
            {messageType === 'TEMPLATE' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px', color: 'var(--admin-text-secondary)' }}>
                    Select WhatsApp Template
                  </label>
                  <select
                    value={selectedTemplateName}
                    onChange={(e) => setSelectedTemplateName(e.target.value)}
                    className="admin-input"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px' }}
                  >
                    {templates.map((t) => (
                      <option key={t.name} value={t.name}>
                        {t.label || t.name} [{t.category}]
                      </option>
                    ))}
                  </select>
                  {currentTemplate?.description && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)', display: 'block', marginTop: '4px' }}>
                      {currentTemplate.description}
                    </span>
                  )}
                </div>

                {/* Dynamic Parameter Inputs */}
                {currentTemplate?.parameters && currentTemplate.parameters.length > 0 && (
                  <div
                    style={{
                      background: 'rgba(0,0,0,0.2)',
                      padding: '14px',
                      borderRadius: '8px',
                      border: '1px solid var(--admin-border, #334155)',
                    }}
                  >
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '10px', color: 'var(--admin-text-muted)' }}>
                      TEMPLATE PLACEHOLDERS
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {currentTemplate.parameters.map((param) => (
                        <div key={param.key}>
                          <label style={{ display: 'block', fontSize: '0.74rem', marginBottom: '4px', color: 'var(--admin-text-secondary)' }}>
                            {param.label} ({`{{${param.key}}}`})
                          </label>
                          <input
                            type="text"
                            placeholder={param.placeholder}
                            value={templateParams[param.key] || ''}
                            onChange={(e) =>
                              setTemplateParams((prev) => ({ ...prev, [param.key]: e.target.value }))
                            }
                            className="admin-input"
                            style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', fontSize: '0.84rem' }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Direct Text Form */}
            {messageType === 'TEXT' && (
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px', color: 'var(--admin-text-secondary)' }}>
                  Message Content *
                </label>
                <textarea
                  rows={4}
                  placeholder="Type customer message or response here..."
                  value={customBody}
                  onChange={(e) => setCustomBody(e.target.value)}
                  className="admin-input"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', resize: 'vertical' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '0.74rem', color: 'var(--admin-text-muted)' }}>
                  <span>* Subject to Meta 24-hour customer-initiated conversation window.</span>
                  <span>{customBody.length} / 4096</span>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setConfirmDialog(true)}
              disabled={sending || !recipient.trim()}
              className="admin-btn admin-btn--primary"
              style={{
                marginTop: '10px',
                padding: '12px 20px',
                borderRadius: '8px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                background: '#25D366',
                color: '#0b2e13',
                border: 'none',
                cursor: sending || !recipient.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              {sending ? 'Dispatching via Kapso...' : '🚀 Send WhatsApp Message'}
            </button>
          </div>

          {/* Live Preview Side (WhatsApp Styled Bubble) */}
          <div
            className="admin-card"
            style={{
              padding: '24px',
              background: 'var(--admin-bg-surface, #1e293b)',
              border: '1px solid var(--admin-border, #334155)',
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <h4 style={{ margin: 0, fontSize: '0.94rem', color: 'var(--admin-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Live WhatsApp Chat Preview
            </h4>

            {/* WhatsApp Device Mockup Box */}
            <div
              style={{
                borderRadius: '16px',
                overflow: 'hidden',
                border: '1px solid #1f2937',
                background: '#0b141a',
                display: 'flex',
                flexDirection: 'column',
                height: '420px',
                boxShadow: '0 12px 30px rgba(0,0,0,0.4)',
              }}
            >
              {/* WhatsApp Chat Header */}
              <div
                style={{
                  background: '#202c33',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: '#25D366',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    color: '#0b2e13',
                    fontSize: '0.9rem',
                  }}
                >
                  OY
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#e9edef', fontSize: '0.9rem', fontWeight: 600 }}>OddsYra Official</div>
                  <div style={{ color: '#8696a0', fontSize: '0.72rem' }}>
                    {status.configured ? 'Verified Business Account' : 'Sandbox Demo'}
                  </div>
                </div>
              </div>

              {/* Chat Canvas */}
              <div
                style={{
                  flex: 1,
                  padding: '16px',
                  background: '#0b141a radial-gradient(circle, rgba(255,255,255,0.02) 1px, transparent 1px)',
                  backgroundSize: '16px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-end',
                }}
              >
                {/* Outbound Chat Bubble */}
                <div
                  style={{
                    alignSelf: 'flex-end',
                    maxWidth: '85%',
                    background: '#005c4b',
                    color: '#e9edef',
                    padding: '8px 12px',
                    borderRadius: '10px 10px 2px 10px',
                    fontSize: '0.86rem',
                    lineHeight: '1.4',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                    wordBreak: 'break-word',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {previewText}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      gap: '4px',
                      marginTop: '4px',
                      fontSize: '0.68rem',
                      color: '#8696a0',
                    }}
                  >
                    <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <span style={{ color: '#53bdeb' }}>✓✓</span>
                  </div>
                </div>
              </div>

              {/* Chat Footer Mock */}
              <div
                style={{
                  background: '#202c33',
                  padding: '8px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#8696a0',
                  fontSize: '0.76rem',
                }}
              >
                <span>To:</span>
                <span style={{ fontFamily: 'monospace', color: '#e9edef' }}>
                  {recipient.trim() || '+91 ••••• •••••'}
                </span>
              </div>
            </div>

            <div style={{ fontSize: '0.74rem', color: 'var(--admin-text-muted)', lineHeight: '1.4' }}>
              💡 Messages are sent through the official Meta WhatsApp Cloud API via Kapso. High delivery rates and end-to-end encryption.
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DELIVERY LOGS */}
      {activeTab === 'logs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Filters Bar */}
          <div
            style={{
              display: 'flex',
              gap: '12px',
              alignItems: 'center',
              flexWrap: 'wrap',
              background: 'var(--admin-bg-surface, #1e293b)',
              padding: '12px 16px',
              borderRadius: '10px',
              border: '1px solid var(--admin-border, #334155)',
            }}
          >
            <input
              type="text"
              placeholder="Search recipient phone..."
              value={logSearchQuery}
              onChange={(e) => setLogSearchQuery(e.target.value)}
              className="admin-input"
              style={{ width: '240px', padding: '7px 10px', borderRadius: '6px', fontSize: '0.82rem' }}
            />

            <select
              value={logFilterStatus}
              onChange={(e) => setLogFilterStatus(e.target.value)}
              className="admin-input"
              style={{ width: '160px', padding: '7px 10px', borderRadius: '6px', fontSize: '0.82rem' }}
            >
              <option value="ALL">All Statuses</option>
              <option value="SENT">SENT</option>
              <option value="MOCK_SENT">MOCK_SENT</option>
              <option value="DELIVERED">DELIVERED</option>
              <option value="FAILED">FAILED</option>
            </select>

            <button
              type="button"
              onClick={loadLogs}
              className="admin-btn admin-btn--secondary admin-btn--sm"
              disabled={loadingLogs}
            >
              {loadingLogs ? 'Loading...' : 'Filter'}
            </button>
          </div>

          <AdminDataTable
            title="WhatsApp Delivery History"
            emptyMessage="No WhatsApp messages dispatched yet"
            data={logs}
            columns={[
              {
                header: 'Message ID',
                key: 'id',
                render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.76rem' }}>{r.id}</span>,
              },
              {
                header: 'Recipient Phone',
                key: 'recipientPhone',
                render: (r) => (
                  <span className="admin-text-mono" style={{ fontWeight: 600, color: '#34d399' }}>
                    {r.recipientPhone}
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
                    {r.templateName && <strong style={{ fontSize: '0.8rem' }}>{r.templateName}</strong>}
                  </div>
                ),
              },
              {
                header: 'Message Body',
                key: 'messageBody',
                render: (r) => (
                  <span
                    style={{
                      maxWidth: '300px',
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
                render: (r) => <span style={{ fontSize: '0.78rem' }}>{r.adminId}</span>,
              },
              {
                header: 'Dispatched At',
                key: 'createdAt',
                render: (r) => (
                  <span style={{ fontSize: '0.76rem' }}>
                    {r.createdAt ? new Date(r.createdAt).toLocaleString() : '—'}
                  </span>
                ),
              },
            ]}
          />
        </div>
      )}

      {/* TAB 3: TEMPLATES */}
      {activeTab === 'templates' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
          {templates.map((t) => (
            <div
              key={t.name}
              className="admin-card"
              style={{
                padding: '20px',
                background: 'var(--admin-bg-surface, #1e293b)',
                border: '1px solid var(--admin-border, #334155)',
                borderRadius: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '0.96rem', color: 'var(--admin-text-primary)' }}>
                    {t.label || t.name}
                  </h4>
                  <span className="admin-text-mono" style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>
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

              <div
                style={{
                  background: 'rgba(0,0,0,0.25)',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontStyle: 'italic',
                  color: 'var(--admin-text-muted)',
                }}
              >
                "{t.sampleText}"
              </div>

              <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTemplateName(t.name);
                    setMessageType('TEMPLATE');
                    setActiveTab('compose');
                  }}
                  className="admin-btn admin-btn--secondary admin-btn--sm"
                >
                  Use Template
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Confirmation Dialog */}
      <AdminConfirmDialog
        isOpen={confirmDialog}
        title="Confirm WhatsApp Dispatch"
        message={`Are you sure you want to send this WhatsApp message to ${recipient}? This will be recorded in the admin audit trail.`}
        confirmLabel={sending ? 'Sending...' : 'Confirm & Dispatch'}
        cancelLabel="Cancel"
        loading={sending}
        onCancel={() => setConfirmDialog(false)}
        onConfirm={handleSend}
      />
    </div>
  );
}
