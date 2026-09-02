import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../utils/apiClient';
import {
  extractTicketsFromResponse,
  ticketId,
  ticketReference,
} from '../../utils/supportTickets';
import {
  createEmptyIntake,
  nextSupportTurn,
  buildTicketPayload,
} from '../../../lib/supportAssistant.mjs';
import SupportAttachmentList from '../Support/SupportAttachmentList';
import {
  SUPPORT_ATTACHMENT_ACCEPT,
  formatAttachmentSize,
  uploadSupportAttachment,
  validateSupportFile,
} from '../../utils/supportAttachments';
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

function keepFieldVisible(event) {
  const el = event.currentTarget;
  window.setTimeout(() => {
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, 50);
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
  const [ticketsError, setTicketsError] = useState('');
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [ticketReply, setTicketReply] = useState('');
  const [ticketReplyFile, setTicketReplyFile] = useState(null);
  const [chatAttachFile, setChatAttachFile] = useState(null);
  const [ticketAttachFile, setTicketAttachFile] = useState(null);
  const [sendingReply, setSendingReply] = useState(false);
  const [replyError, setReplyError] = useState('');
  const ticketReplyRef = useRef(null);
  const chatFileRef = useRef(null);
  const ticketReplyFileRef = useRef(null);
  const createTicketFileRef = useRef(null);

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

  const fetchUserTickets = useCallback(async () => {
    if (!isLoggedIn) return [];
    setLoadingTickets(true);
    setTicketsError('');
    try {
      const res = await apiFetch('/api/v1/support/tickets', { method: 'GET' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Could not load tickets.');
      }
      const list = extractTicketsFromResponse(data);
      setUserTickets(list);
      return list;
    } catch (err) {
      setTicketsError(err.message || 'Could not load tickets.');
      return [];
    } finally {
      setLoadingTickets(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (isOpen && isLoggedIn) {
      fetchUserTickets();
    }
  }, [isOpen, isLoggedIn, activeTab, fetchUserTickets]);

  useEffect(() => {
    if (activeTab !== 'my_tickets') return;
    if (selectedTicketId || userTickets.length === 0) return;
    setSelectedTicketId(ticketId(userTickets[0]));
  }, [activeTab, userTickets, selectedTicketId]);

  const isClosedTicket = (status) => {
    const s = String(status || '').toUpperCase();
    return s === 'CLOSED' || s === 'RESOLVED';
  };

  const handleTicketReply = async (event, ticket) => {
    event.preventDefault();
    event.stopPropagation();
    const text = ticketReply.trim();
    if (!ticket || (!text && !ticketReplyFile) || sendingReply) return;
    const ref = ticketReference(ticket) || ticketId(ticket);
    setSendingReply(true);
    setReplyError('');
    try {
      let attachments = [];
      if (ticketReplyFile) {
        attachments = [await uploadSupportAttachment(ticketReplyFile, {
          conversationId: ticketId(ticket),
        })];
      }
      const res = await apiFetch(`/api/v1/support/tickets/${encodeURIComponent(ref)}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          text: text || (attachments.length ? 'Sent an attachment' : ''),
          attachments,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not send reply.');
      const sent = data.message || {
        id: `local_${Date.now()}`,
        senderType: 'user',
        text: text || 'Sent an attachment',
        attachments,
        createdAt: new Date().toISOString(),
      };
      setTicketReply('');
      setTicketReplyFile(null);
      if (ticketReplyFileRef.current) ticketReplyFileRef.current.value = '';
      setUserTickets((prev) =>
        prev.map((row) => {
          if (ticketId(row) !== ticketId(ticket)) return row;
          return { ...row, messages: [...(row.messages || []), sent] };
        })
      );
      showToast?.('Reply sent.', 'success');
      fetchUserTickets();
    } catch (err) {
      setReplyError(err.message || 'Could not send reply.');
    } finally {
      setSendingReply(false);
      requestAnimationFrame(() => ticketReplyRef.current?.focus());
    }
  };

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
            attachments: payload.attachments || [],
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
    const trimmed = String(textToSend || '').trim();
    const pendingFile = chatAttachFile;
    if (!trimmed && !pendingFile) return;

    let attachments = [];
    try {
      if (pendingFile) {
        attachments = [await uploadSupportAttachment(pendingFile, {
          conversationId: chatSession?.conversationId || null,
        })];
      }
    } catch (err) {
      showToast?.(err.message || 'Attachment upload failed', 'error');
      return;
    }

    const userMsg = {
      id: `u_${Date.now()}`,
      sender: 'user',
      text: trimmed || (attachments.length ? 'Sent an attachment' : ''),
      attachments,
      timestamp: nowStamp(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setChatAttachFile(null);
    if (chatFileRef.current) chatFileRef.current.value = '';

    if (isLiveAgentMode && chatSession?.conversationId) {
      // Always persist via HTTP so attachments and history are stored; WS is best-effort notify.
      try {
        await apiFetch(`/api/v1/support/live-chat/${chatSession.conversationId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: userMsg.text, attachments }),
        });
      } catch {
        showToast?.('Message may not have been delivered. Please retry.', 'error');
      }
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'user_message',
            conversationId: chatSession.conversationId,
            content: userMsg.text,
            attachments,
          })
        );
      }
      return;
    }

    // AI Assistant Mode Fallback (text only — attachments still shown locally)
    if (!trimmed) {
      setMessages((prev) => [
        ...prev,
        {
          id: `a_${Date.now()}`,
          sender: 'agent',
          agentName: 'OddsYra Support',
          text: 'Thanks for the file. For attachments, please create a support ticket so our team can review it.',
          timestamp: nowStamp(),
        },
      ]);
      return;
    }

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
    if (!ticketDescription.trim() && !ticketAttachFile) {
      setTicketError('Please provide a description or attachment.');
      return;
    }

    setTicketSubmitting(true);
    setTicketError('');

    try {
      let attachments = [];
      if (ticketAttachFile) {
        attachments = [await uploadSupportAttachment(ticketAttachFile)];
      }
      const payload = {
        category: ticketCategory,
        subject: ticketSubject.trim(),
        description: ticketDescription.trim() || (attachments.length ? 'Sent an attachment' : ''),
        priority: ticketPriority,
        attachments,
      };

      const res = await apiFetch('/api/v1/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (res.status === 409 || data.isDuplicate) {
        const existing = data.activeTicket || data.data?.activeTicket || null;
        const list = await fetchUserTickets();
        const existingId = ticketId(existing);
        if (existing && !list.some((t) => ticketId(t) === existingId)) {
          const merged = extractTicketsFromResponse({ tickets: [existing] });
          setUserTickets((prev) => {
            const ids = new Set(prev.map(ticketId));
            return [...merged.filter((t) => !ids.has(ticketId(t))), ...prev];
          });
        }
        if (existingId) setSelectedTicketId(existingId);
        setTicketError('');
        setActiveTab('my_tickets');
        const ref = ticketReference(existing) || data.ticketReference;
        showToast?.(
          ref
            ? `You already have open ticket ${ref}. Opening it now.`
            : 'You already have an active ticket for this issue.',
          'info'
        );
        return;
      }
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit support ticket.');
      }

      const created = data.ticket || data.data || {};
      const refNum = data.ticketReference
        || created.referenceNumber
        || created.ticketReference
        || created.ticketNumber
        || created.conversationNumber
        || `TICK-${Date.now().toString().slice(-6)}`;
      setCreatedTicketResult({
        id: created.id,
        referenceNumber: refNum,
        subject: ticketSubject.trim(),
        category: ticketCategory,
      });

      showToast?.(`Ticket ${refNum} created successfully!`, 'success');
      setTicketSubject('');
      setTicketDescription('');
      setTicketAttachFile(null);
      if (createTicketFileRef.current) createTicketFileRef.current.value = '';
      fetchUserTickets();

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
                {userTickets.length > 0 && (
                  <span className="live-chat-tab-count">{userTickets.length}</span>
                )}
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
                          {m.text ? <p>{m.text}</p> : null}
                          <SupportAttachmentList attachments={m.attachments} />
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
                      ref={chatFileRef}
                      type="file"
                      accept={SUPPORT_ATTACHMENT_ACCEPT}
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const err = validateSupportFile(file);
                        if (err) {
                          showToast?.(err, 'error');
                          e.target.value = '';
                          return;
                        }
                        setChatAttachFile(file);
                      }}
                    />
                    <button
                      type="button"
                      className="live-chat-send-btn"
                      title="Attach file"
                      onClick={() => chatFileRef.current?.click()}
                      disabled={chatSession?.status === 'ENDED'}
                      style={{ opacity: 0.9 }}
                    >
                      📎
                    </button>
                    <input
                      type="text"
                      placeholder={
                        chatSession?.status === 'ENDED'
                          ? 'Chat session has ended.'
                          : 'Type your message...'
                      }
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onFocus={keepFieldVisible}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                      disabled={chatSession?.status === 'ENDED'}
                    />
                    <button
                      type="button"
                      className="live-chat-send-btn"
                      onClick={() => handleSendMessage()}
                      disabled={(!inputText.trim() && !chatAttachFile) || isTyping || chatSession?.status === 'ENDED'}
                    >
                      <FiSend size={18} color="#ffffff" />
                    </button>
                  </div>
                  {chatAttachFile && (
                    <div style={{ fontSize: '0.72rem', color: '#60a5fa', padding: '0 8px 6px' }}>
                      {chatAttachFile.name} ({formatAttachmentSize(chatAttachFile.size)})
                      {' '}
                      <button
                        type="button"
                        onClick={() => {
                          setChatAttachFile(null);
                          if (chatFileRef.current) chatFileRef.current.value = '';
                        }}
                        style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        Remove
                      </button>
                    </div>
                  )}

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

                    {userTickets.some((t) =>
                      String(t.category || '').toUpperCase() === String(ticketCategory).toUpperCase()
                      && ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_USER', 'PENDING_USER', 'PENDING_INTERNAL', 'ESCALATED', 'REOPENED'].includes(String(t.status || '').toUpperCase())
                    ) && (
                      <div className="in-sheet-form-notice">
                        You already have an open {TICKET_CATEGORIES.find((c) => c.value === ticketCategory)?.label || ticketCategory} ticket.
                        {' '}
                        <button
                          type="button"
                          className="in-sheet-inline-link"
                          onClick={() => setActiveTab('my_tickets')}
                        >
                          View it in My Tickets
                        </button>
                      </div>
                    )}

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
                        onFocus={keepFieldVisible}
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
                        onFocus={keepFieldVisible}
                        className="in-sheet-textarea"
                      />
                    </div>

                    <div className="form-row">
                      <label>Attachment (optional)</label>
                      <input
                        ref={createTicketFileRef}
                        type="file"
                        accept={SUPPORT_ATTACHMENT_ACCEPT}
                        className="in-sheet-input"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) {
                            setTicketAttachFile(null);
                            return;
                          }
                          const err = validateSupportFile(file);
                          if (err) {
                            setTicketError(err);
                            e.target.value = '';
                            return;
                          }
                          setTicketAttachFile(file);
                          setTicketError('');
                        }}
                      />
                      {ticketAttachFile && (
                        <div style={{ fontSize: '0.72rem', color: '#60a5fa', marginTop: 4 }}>
                          {ticketAttachFile.name} ({formatAttachmentSize(ticketAttachFile.size)})
                        </div>
                      )}
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
                ) : loadingTickets && userTickets.length === 0 ? (
                  <div className="in-sheet-loading">Loading your tickets...</div>
                ) : ticketsError ? (
                  <div className="in-sheet-empty-tickets">
                    <p>{ticketsError}</p>
                    <button
                      type="button"
                      className="in-sheet-btn in-sheet-btn--secondary"
                      onClick={() => fetchUserTickets()}
                    >
                      Retry
                    </button>
                  </div>
                ) : userTickets.length === 0 ? (
                  <div className="in-sheet-empty-tickets">
                    <p>You have no support tickets yet.</p>
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
                    {userTickets.map((t) => {
                      const id = ticketId(t);
                      const ref = ticketReference(t);
                      const selected = selectedTicketId === id;
                      const closed = isClosedTicket(t.status);
                      const created = t.createdAt ? new Date(t.createdAt) : null;
                      const createdLabel = created && !Number.isNaN(created.getTime())
                        ? created.toLocaleDateString()
                        : '';
                      const thread = t.messages || [];
                      return (
                        <article
                          key={id}
                          className={`in-sheet-ticket-card ${selected ? 'in-sheet-ticket-card--selected' : ''}`}
                        >
                          <button
                            type="button"
                            className="in-sheet-ticket-card-toggle"
                            onClick={() => setSelectedTicketId(selected ? null : id)}
                          >
                            <div className="ticket-card-header">
                              <span className="ticket-card-ref">{ref || id}</span>
                              <span className={`ticket-status-pill status--${String(t.status || 'open').toLowerCase()}`}>
                                {t.status}
                              </span>
                            </div>
                            <span className="ticket-card-subject">{t.subject}</span>
                            <div className="ticket-card-meta">
                              <span>{t.category}</span>
                              <span>{createdLabel}</span>
                            </div>
                          </button>
                          {selected && (
                            <>
                              <div className="ticket-card-thread">
                                {thread.length === 0 ? (
                                  <p className="ticket-card-thread-empty">No messages yet.</p>
                                ) : (
                                  thread.map((msg) => {
                                    const sender = String(msg.senderType || msg.sender_type || msg.sender || 'user').toLowerCase();
                                    const isAgent = sender === 'admin' || sender === 'agent' || sender === 'system';
                                    return (
                                      <div
                                        key={msg.messageId || msg.id || msg.createdAt}
                                        className={`ticket-thread-msg ${isAgent ? 'ticket-thread-msg--agent' : 'ticket-thread-msg--user'}`}
                                      >
                                        <span className="ticket-thread-msg-label">
                                          {isAgent ? (msg.agentName || 'Support') : 'You'}
                                        </span>
                                        {msg.text ? <p>{msg.text}</p> : null}
                                        <SupportAttachmentList attachments={msg.attachments} />
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                              {closed ? (
                                <p className="ticket-card-closed-note">This ticket is closed. Create a new ticket if you still need help.</p>
                              ) : (
                                <form
                                  className="ticket-card-reply"
                                  onSubmit={(e) => handleTicketReply(e, t)}
                                >
                                  {replyError && <div className="in-sheet-form-error">{replyError}</div>}
                                  <textarea
                                    ref={ticketReplyRef}
                                    rows={2}
                                    className="in-sheet-textarea"
                                    placeholder="Write a reply to support…"
                                    value={ticketReply}
                                    onChange={(e) => setTicketReply(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    onFocus={keepFieldVisible}
                                    disabled={sendingReply}
                                  />
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                                    <input
                                      ref={ticketReplyFileRef}
                                      type="file"
                                      accept={SUPPORT_ATTACHMENT_ACCEPT}
                                      style={{ display: 'none' }}
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        const err = validateSupportFile(file);
                                        if (err) {
                                          setReplyError(err);
                                          e.target.value = '';
                                          return;
                                        }
                                        setTicketReplyFile(file);
                                        setReplyError('');
                                      }}
                                    />
                                    <button
                                      type="button"
                                      className="in-sheet-btn in-sheet-btn--secondary"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        ticketReplyFileRef.current?.click();
                                      }}
                                      disabled={sendingReply}
                                    >
                                      Attach
                                    </button>
                                    {ticketReplyFile && (
                                      <span style={{ fontSize: '0.72rem', color: '#60a5fa' }}>
                                        {ticketReplyFile.name}
                                      </span>
                                    )}
                                  </div>
                                  <button
                                    type="submit"
                                    className="in-sheet-btn in-sheet-btn--primary in-sheet-btn--full"
                                    disabled={sendingReply || (!ticketReply.trim() && !ticketReplyFile)}
                                  >
                                    {sendingReply ? 'Sending…' : 'Send reply'}
                                  </button>
                                </form>
                              )}
                            </>
                          )}
                        </article>
                      );
                    })}
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
