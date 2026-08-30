import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../utils/apiClient';
import {
  createEmptyIntake,
  nextSupportTurn,
  buildTicketPayload,
} from '../../../lib/supportAssistant.mjs';
import {
  FiSend,
  FiShield,
} from '../../icons';
import SupportHeadsetIcon from '../../icons/SupportHeadsetIcon';
import { hoverScale, pressScale, springUi } from '../../utils/motionPresets';
import './LiveChatSupportWidget.css';

const TICKET_CATEGORIES = [
  { value: 'DEPOSIT', label: 'Deposit Issue' },
  { value: 'WITHDRAWAL', label: 'Withdrawal Issue' },
  { value: 'BET', label: 'Bet Placement' },
  { value: 'BET_SETTLEMENT', label: 'Bet Settlement Dispute' },
  { value: 'ACCOUNT', label: 'Account & Login' },
  { value: 'KYC', label: 'KYC & Verification' },
  { value: 'BONUS', label: 'Bonus & Wagering' },
  { value: 'TECHNICAL', label: 'Technical / Bug' },
  { value: 'OTHER', label: 'Other Support Issue' },
];

function storageKey(userId) {
  return `oddsyra_support_chat_v2_${userId || 'guest'}`;
}

function nowStamp() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function welcomeMessage(name) {
  return {
    id: 'welcome_1',
    sender: 'agent',
    agentName: 'OddsYra Support',
    text: `Hi ${name || 'there'}! I’m the OddsYra support assistant. You can chat with our live agents or submit and track support tickets directly in this window.`,
    timestamp: nowStamp(),
  };
}

function loadSavedChat(userId) {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw && userId) {
      const guest = localStorage.getItem(storageKey(null));
      if (guest) return JSON.parse(guest);
    }
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveChat(userId, payload) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(payload));
  } catch {
    // ignore quota
  }
}

export default function LiveChatSupportWidget() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isLoggedIn, openLoginModal, showToast, isSidebarOpen } = useAuth();
  const userId = user?.userId || user?.id || null;
  const displayName = user?.displayName;

  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'create_ticket' | 'my_tickets'
  const [unreadCount, setUnreadCount] = useState(0);
  const [messages, setMessages] = useState(() => [welcomeMessage(displayName)]);
  const [inputText, setInputText] = useState('');
  const [chatSession, setChatSession] = useState(null); // { conversationId, status, assignedAgentName }
  const [isLiveAgentMode, setIsLiveAgentMode] = useState(false);
  const [connectingLive, setConnectingLive] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [typingText, setTypingText] = useState('OddsYra Support is typing...');
  const [hydrated, setHydrated] = useState(false);
  const messagesEndRef = useRef(null);
  const wsRef = useRef(null);

  // In-Sheet Ticket Creation State
  const [ticketCategory, setTicketCategory] = useState('DEPOSIT');
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketDescription, setTicketDescription] = useState('');
  const [ticketPriority, setTicketPriority] = useState('NORMAL');
  const [ticketSubmitting, setTicketSubmitting] = useState(false);
  const [ticketError, setTicketError] = useState('');
  const [createdTicketResult, setCreatedTicketResult] = useState(null);

  // In-Sheet My Tickets State
  const [userTickets, setUserTickets] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(false);

  const isAdminRoute = location.pathname.startsWith('/admin');

  useEffect(() => {
    const saved = loadSavedChat(userId);
    if (saved?.messages?.length) {
      setMessages(saved.messages);
      if (saved.chatSession) {
        setChatSession(saved.chatSession);
        setIsLiveAgentMode(true);
      }
    } else {
      setMessages([welcomeMessage(displayName)]);
      setChatSession(null);
      setIsLiveAgentMode(false);
    }
    setHydrated(true);
  }, [userId, displayName]);

  useEffect(() => {
    if (!hydrated) return;
    saveChat(userId, { messages, chatSession });
  }, [hydrated, userId, messages, chatSession]);

  // Handle global open/close events
  useEffect(() => {
    const openChat = (event) => {
      setIsOpen(true);
      if (event?.detail?.tab) {
        setActiveTab(event.detail.tab);
      }
      if (event?.detail?.startLive) {
        startLiveChatSession();
      }
    };
    const closeChat = () => setIsOpen(false);
    window.addEventListener('oddsyra:open-support-chat', openChat);
    window.addEventListener('oddsyra:close-support-chat', closeChat);
    return () => {
      window.removeEventListener('oddsyra:open-support-chat', openChat);
      window.removeEventListener('oddsyra:close-support-chat', closeChat);
    };
  }, []);

  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (isOpen && activeTab === 'chat') {
      scrollToBottom();
      setUnreadCount(0);
    }
  }, [isOpen, activeTab, messages, scrollToBottom]);

  // Fetch user tickets when My Tickets tab is selected
  const fetchUserTickets = useCallback(async () => {
    if (!isLoggedIn) return;
    setLoadingTickets(true);
    try {
      const res = await apiFetch('/api/v1/support/tickets', { method: 'GET' });
      if (res.ok) {
        const data = await res.json();
        setUserTickets(data.data?.tickets || data.data || []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingTickets(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (isOpen && activeTab === 'my_tickets') {
      fetchUserTickets();
    }
  }, [isOpen, activeTab, fetchUserTickets]);

  // WebSocket Live Agent Handler
  const connectLiveChatWs = useCallback((conversationId) => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/support?conversationId=${encodeURIComponent(conversationId)}`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'agent_message' || payload.type === 'message') {
          const newMsg = {
            id: payload.messageId || `msg_${Date.now()}`,
            sender: 'agent',
            agentName: payload.senderName || 'Support Agent',
            text: payload.text || payload.content,
            timestamp: nowStamp(),
          };
          setMessages((prev) => [...prev, newMsg]);
          setIsTyping(false);
        } else if (payload.type === 'typing') {
          setIsTyping(true);
          setTypingText(`${payload.agentName || 'Agent'} is typing...`);
        } else if (payload.type === 'stop_typing') {
          setIsTyping(false);
        } else if (payload.type === 'agent_assigned') {
          const assignMsg = {
            id: `sys_${Date.now()}`,
            sender: 'agent',
            agentName: 'System',
            text: `Agent ${payload.agentName || 'Support Specialist'} has joined the chat.`,
            timestamp: nowStamp(),
          };
          setMessages((prev) => [...prev, assignMsg]);
        }
      } catch {
        // parse error
      }
    };

    ws.onerror = () => {
      // ws error fallback
    };

    wsRef.current = ws;
  }, []);

  const startLiveChatSession = async () => {
    if (chatSession?.conversationId) {
      setActiveTab('chat');
      return;
    }
    setConnectingLive(true);
    try {
      const res = await apiFetch('/api/v1/support/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'WEB_CHAT',
          initialMessage: 'User requested live agent support.',
        }),
      });
      const data = await res.json();
      if (res.ok && data.data?.id) {
        const newSession = {
          conversationId: data.data.id,
          status: 'OPEN',
          assignedAgentName: data.data.assignedAgent?.displayName || 'Support Agent',
        };
        setChatSession(newSession);
        setIsLiveAgentMode(true);
        setActiveTab('chat');
        connectLiveChatWs(data.data.id);
        setMessages((prev) => [
          ...prev,
          {
            id: `live_start_${Date.now()}`,
            sender: 'agent',
            agentName: 'System',
            text: 'You are connected to OddsYra Live Support. An agent will assist you shortly.',
            timestamp: nowStamp(),
          },
        ]);
      } else {
        throw new Error(data.error || 'Failed to start live session');
      }
    } catch {
      showToast?.('Live chat is operating in assistant mode.', 'info');
      setActiveTab('chat');
    } finally {
      setConnectingLive(false);
    }
  };

  const handleSendMessage = async (textToSend = inputText) => {
    const trimmed = textToSend.trim();
    if (!trimmed) return;

    const userMsg = {
      id: `u_${Date.now()}`,
      sender: 'user',
      text: trimmed,
      timestamp: nowStamp(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInputText('');

    if (isLiveAgentMode && chatSession?.conversationId) {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'user_message',
            conversationId: chatSession.conversationId,
            content: trimmed,
          })
        );
      } else {
        await apiFetch(`/api/v1/support/conversations/${chatSession.conversationId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: trimmed }),
        });
      }
      return;
    }

    // AI Assistant Mode Fallback
    setIsTyping(true);
    setTypingText('OddsYra Support is typing...');
    try {
      const intake = createEmptyIntake(displayName);
      const turn = await nextSupportTurn(intake, trimmed, messages);
      setIsTyping(false);
      if (turn?.reply) {
        setMessages((prev) => [
          ...prev,
          {
            id: `a_${Date.now()}`,
            sender: 'agent',
            agentName: 'OddsYra Support',
            text: turn.reply,
            timestamp: nowStamp(),
            actions: turn.actions || [],
          },
        ]);
      }
    } catch {
      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          id: `a_${Date.now()}`,
          sender: 'agent',
          agentName: 'OddsYra Support',
          text: 'Thanks for your message! You can also create a formal support ticket using the Create Ticket tab above.',
          timestamp: nowStamp(),
        },
      ]);
    }
  };

  const handleInSheetTicketSubmit = async (e) => {
    e.preventDefault();
    if (!isLoggedIn) {
      openLoginModal?.();
      return;
    }
    if (!ticketSubject.trim()) {
      setTicketError('Please enter a subject.');
      return;
    }
    if (!ticketDescription.trim()) {
      setTicketError('Please provide a description.');
      return;
    }

    setTicketSubmitting(true);
    setTicketError('');

    try {
      const payload = {
        category: ticketCategory,
        subject: ticketSubject.trim(),
        description: ticketDescription.trim(),
        priority: ticketPriority,
      };

      const res = await apiFetch('/api/v1/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit support ticket.');
      }

      const created = data.data || {};
      const refNum = created.referenceNumber || created.ticketReference || `TICK-${Date.now().toString().slice(-6)}`;
      setCreatedTicketResult({
        id: created.id,
        referenceNumber: refNum,
        subject: ticketSubject.trim(),
        category: ticketCategory,
      });

      showToast?.(`Ticket ${refNum} created successfully!`, 'success');
      setTicketSubject('');
      setTicketDescription('');

      // Also append notice to chat history
      setMessages((prev) => [
        ...prev,
        {
          id: `sys_ticket_${Date.now()}`,
          sender: 'agent',
          agentName: 'System',
          text: `🎫 Ticket #${refNum} has been created for "${payload.subject}". Our support team will respond promptly.`,
          timestamp: nowStamp(),
        },
      ]);
    } catch (err) {
      setTicketError(err.message || 'Error submitting ticket.');
    } finally {
      setTicketSubmitting(false);
    }
  };

  if (isAdminRoute) return null;

  return (
    <div className={`live-chat-support-wrapper ${isOpen ? 'live-chat-support-wrapper--open' : ''}`}>
      {/* FLOATING ACTION BUTTON */}
      {!isOpen && (
        <div className="live-chat-wrapper">
          <motion.button
            type="button"
            className="live-chat-fab"
            onClick={() => setIsOpen(true)}
            whileHover={hoverScale}
            whileTap={pressScale}
            transition={springUi}
            title="Customer Support & Live Chat"
            aria-label="Open support chat"
          >
            <div className="live-chat-fab-inner">
              <SupportHeadsetIcon size={26} color="#ffffff" />
              {unreadCount > 0 && <span className="live-chat-unread-dot">{unreadCount}</span>}
            </div>
          </motion.button>
        </div>
      )}

      {/* CHAT / TICKET SHEET MODAL */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="live-chat-sheet"
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
          >
            {/* SHEET HEADER */}
            <div className="live-chat-header">
              <div className="live-chat-header-info">
                <div className="live-chat-avatar">
                  <SupportHeadsetIcon size={20} color="#ffffff" />
                </div>
                <div>
                  <h3 className="live-chat-title">OddsYra Support</h3>
                  <span className="live-chat-status">
                    <span className="status-dot status-dot--online" />
                    {isLiveAgentMode ? 'Live Agent Connected' : '24/7 Live Desk'}
                  </span>
                </div>
              </div>

              <div className="live-chat-header-actions">
                <button
                  type="button"
                  className="live-chat-control-btn live-chat-close-btn"
                  onClick={() => setIsOpen(false)}
                  title="Close Support Sheet"
                  aria-label="Close support sheet"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* IN-SHEET NAVIGATION TABS */}
            <div className="live-chat-nav-tabs">
              <button
                type="button"
                className={`live-chat-nav-tab ${activeTab === 'chat' ? 'active' : ''}`}
                onClick={() => setActiveTab('chat')}
              >
                💬 Live Chat
              </button>
              <button
                type="button"
                className={`live-chat-nav-tab ${activeTab === 'create_ticket' ? 'active' : ''}`}
                onClick={() => {
                  setCreatedTicketResult(null);
                  setActiveTab('create_ticket');
                }}
              >
                🎫 Create Ticket
              </button>
              <button
                type="button"
                className={`live-chat-nav-tab ${activeTab === 'my_tickets' ? 'active' : ''}`}
                onClick={() => setActiveTab('my_tickets')}
              >
                📋 My Tickets
              </button>
            </div>

            {/* TAB 1: LIVE CHAT */}
            {activeTab === 'chat' && (
              <>
                <div className="live-chat-body">
                  {!isLiveAgentMode && (
                    <div className="live-chat-topics-row">
                      <span className="topics-label">Quick actions:</span>
                      <button
                        type="button"
                        className="chat-topic-chip"
                        onClick={startLiveChatSession}
                        disabled={connectingLive}
                      >
                        💬 Talk to Agent
                      </button>
                      <button
                        type="button"
                        className="chat-topic-chip"
                        onClick={() => {
                          setCreatedTicketResult(null);
                          setActiveTab('create_ticket');
                        }}
                      >
                        🎫 Create Ticket
                      </button>
                    </div>
                  )}

                  <div className="live-chat-messages-list">
                    {messages.map((m) => (
                      <div key={m.id} className={`chat-bubble-row chat-bubble-row--${m.sender}`}>
                        {m.sender === 'agent' && (
                          <div className="chat-bubble-avatar">
                            {isLiveAgentMode ? '👤' : '🤖'}
                          </div>
                        )}
                        <div className={`chat-bubble chat-bubble--${m.sender}`}>
                          <p>{m.text}</p>
                          <span className="chat-bubble-time">{m.timestamp}</span>
                        </div>
                      </div>
                    ))}

                    {isTyping && (
                      <div className="chat-bubble-row chat-bubble-row--agent">
                        <div className="chat-bubble-avatar">🤖</div>
                        <div className="chat-bubble chat-bubble--agent chat-bubble--typing">
                          <span className="text-xs text-slate-300 mr-2">{typingText}</span>
                          <span className="typing-dot" />
                          <span className="typing-dot" />
                          <span className="typing-dot" />
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </div>

                <div className="live-chat-footer">
                  <div className="live-chat-input-bar">
                    <input
                      type="text"
                      placeholder={
                        chatSession?.status === 'ENDED'
                          ? 'Chat session has ended.'
                          : 'Type your message...'
                      }
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                      disabled={chatSession?.status === 'ENDED'}
                    />
                    <button
                      type="button"
                      className="live-chat-send-btn"
                      onClick={() => handleSendMessage()}
                      disabled={!inputText.trim() || isTyping || chatSession?.status === 'ENDED'}
                    >
                      <FiSend size={18} color="#ffffff" />
                    </button>
                  </div>

                  <div className="live-chat-footer-actions">
                    <button
                      type="button"
                      className="create-ticket-btn"
                      onClick={() => {
                        setCreatedTicketResult(null);
                        setActiveTab('create_ticket');
                      }}
                    >
                      🎫 Submit Support Ticket
                    </button>
                    <span className="secure-badge">
                      <FiShield /> 256-bit Encrypted
                    </span>
                  </div>
                </div>
              </>
            )}

            {/* TAB 2: IN-SHEET CREATE TICKET */}
            {activeTab === 'create_ticket' && (
              <div className="live-chat-body live-chat-body--form">
                {createdTicketResult ? (
                  <div className="in-sheet-ticket-success">
                    <div className="success-icon">✅</div>
                    <h4>Support Ticket Submitted</h4>
                    <p className="success-ref">
                      Reference: <strong>{createdTicketResult.referenceNumber}</strong>
                    </p>
                    <p className="success-desc">
                      Your ticket regarding <strong>{createdTicketResult.subject}</strong> has been logged. Our agents will notify you once reviewed.
                    </p>
                    <div className="success-actions">
                      <button
                        type="button"
                        className="in-sheet-btn in-sheet-btn--primary"
                        onClick={() => setActiveTab('my_tickets')}
                      >
                        📋 View My Tickets
                      </button>
                      <button
                        type="button"
                        className="in-sheet-btn in-sheet-btn--secondary"
                        onClick={() => setActiveTab('chat')}
                      >
                        💬 Return to Chat
                      </button>
                    </div>
                  </div>
                ) : !isLoggedIn ? (
                  <div className="in-sheet-auth-prompt">
                    <div className="auth-icon">🔒</div>
                    <h4>Login Required</h4>
                    <p>Please log in to your OddsYra account to create a trackable support ticket.</p>
                    <button
                      type="button"
                      className="in-sheet-btn in-sheet-btn--primary"
                      onClick={() => openLoginModal?.()}
                    >
                      Log In to OddsYra
                    </button>
                  </div>
                ) : (
                  <form className="in-sheet-ticket-form" onSubmit={handleInSheetTicketSubmit}>
                    <h4 className="form-title">Create Support Ticket</h4>

                    {ticketError && <div className="in-sheet-form-error">{ticketError}</div>}

                    <div className="form-row">
                      <label>Category</label>
                      <select
                        value={ticketCategory}
                        onChange={(e) => setTicketCategory(e.target.value)}
                        className="in-sheet-select"
                      >
                        {TICKET_CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-row">
                      <label>Priority</label>
                      <div className="priority-pills">
                        {['NORMAL', 'HIGH', 'URGENT'].map((p) => (
                          <button
                            key={p}
                            type="button"
                            className={`priority-pill priority-pill--${p.toLowerCase()} ${ticketPriority === p ? 'active' : ''}`}
                            onClick={() => setTicketPriority(p)}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="form-row">
                      <label>Subject</label>
                      <input
                        type="text"
                        placeholder="Brief summary of the issue..."
                        value={ticketSubject}
                        onChange={(e) => setTicketSubject(e.target.value)}
                        className="in-sheet-input"
                        required
                      />
                    </div>

                    <div className="form-row">
                      <label>Description</label>
                      <textarea
                        rows={4}
                        placeholder="Please provide full details (bet ID, transaction ref, etc.)..."
                        value={ticketDescription}
                        onChange={(e) => setTicketDescription(e.target.value)}
                        className="in-sheet-textarea"
                        required
                      />
                    </div>

                    <button
                      type="submit"
                      className="in-sheet-btn in-sheet-btn--primary in-sheet-btn--full"
                      disabled={ticketSubmitting}
                    >
                      {ticketSubmitting ? 'Submitting Ticket...' : '🚀 Submit Ticket'}
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* TAB 3: IN-SHEET MY TICKETS */}
            {activeTab === 'my_tickets' && (
              <div className="live-chat-body live-chat-body--tickets">
                {!isLoggedIn ? (
                  <div className="in-sheet-auth-prompt">
                    <div className="auth-icon">🔒</div>
                    <h4>Login Required</h4>
                    <p>Log in to view your open support tickets and status updates.</p>
                    <button
                      type="button"
                      className="in-sheet-btn in-sheet-btn--primary"
                      onClick={() => openLoginModal?.()}
                    >
                      Log In
                    </button>
                  </div>
                ) : loadingTickets ? (
                  <div className="in-sheet-loading">Loading your tickets...</div>
                ) : userTickets.length === 0 ? (
                  <div className="in-sheet-empty-tickets">
                    <p>You have no active support tickets.</p>
                    <button
                      type="button"
                      className="in-sheet-btn in-sheet-btn--secondary"
                      onClick={() => setActiveTab('create_ticket')}
                    >
                      + Create a Ticket
                    </button>
                  </div>
                ) : (
                  <div className="in-sheet-ticket-list">
                    {userTickets.map((t) => (
                      <div key={t.id} className="in-sheet-ticket-card">
                        <div className="ticket-card-header">
                          <span className="ticket-card-ref">{t.referenceNumber || t.ticketReference || `#${t.id.slice(0, 8)}`}</span>
                          <span className={`ticket-status-pill status--${String(t.status || 'open').toLowerCase()}`}>
                            {t.status}
                          </span>
                        </div>
                        <h5 className="ticket-card-subject">{t.subject}</h5>
                        <div className="ticket-card-meta">
                          <span>{t.category}</span>
                          <span>{new Date(t.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
