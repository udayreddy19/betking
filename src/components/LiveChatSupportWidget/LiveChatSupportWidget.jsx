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
    text: `Hi ${name || 'there'}. I’m the OddsYra support assistant. You can chat with our team, or create a formal ticket tracked in your account.`,
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

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isTyping]);

  // WebSocket Live Connection
  useEffect(() => {
    if (!chatSession?.conversationId || !isOpen) return;

    let ws = null;
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/support`;
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'subscribe',
            channel: `support:conversation:${chatSession.conversationId}`,
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.eventType === 'support.message.created' && data.payload?.conversationId === chatSession.conversationId) {
            const newMsg = data.payload;
            if (newMsg.senderType === 'admin' || newMsg.senderType === 'system') {
              setMessages((prev) => {
                if (prev.some((m) => m.id === newMsg.messageId || m.messageId === newMsg.messageId)) return prev;
                return [
                  ...prev,
                  {
                    id: newMsg.messageId || `msg_${Date.now()}`,
                    sender: newMsg.senderType === 'admin' ? 'agent' : 'system',
                    agentName: newMsg.agentName || 'OddsYra Support',
                    text: newMsg.text,
                    timestamp: nowStamp(),
                  },
                ];
              });
            }
          } else if (data.eventType === 'support.livechat.accepted') {
            setChatSession((prev) => (prev ? { ...prev, status: 'ACTIVE', assignedAgentName: data.payload.agentName } : prev));
          } else if (data.eventType === 'support.livechat.ended') {
            setChatSession((prev) => (prev ? { ...prev, status: 'ENDED' } : prev));
          } else if (data.eventType === 'support.livechat.escalated') {
            setChatSession((prev) => (prev ? { ...prev, status: 'ESCALATED_TO_TICKET', ticketReference: data.payload.ticketReference } : prev));
          }
        } catch {
          // ignore malformed
        }
      };
    } catch {
      // WS unavailable
    }

    return () => {
      if (ws) ws.close();
    };
  }, [chatSession?.conversationId, isOpen]);

  const startLiveChatSession = async () => {
    if (!isLoggedIn) {
      showToast('Please log in to start a live chat session.', 'info');
      openLoginModal?.();
      return;
    }

    setConnectingLive(true);
    try {
      const res = await apiFetch('/api/v1/support/live-chat/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initialMessage: 'User requested live support agent.' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to initiate live chat.');

      setChatSession(data.chat);
      setIsLiveAgentMode(true);

      setMessages((prev) => [
        ...prev,
        {
          id: `msg_sys_${Date.now()}`,
          sender: 'system',
          text: 'Connected to live support queue. Waiting for an available agent...',
          timestamp: nowStamp(),
        },
      ]);
    } catch (err) {
      showToast(err.message || 'Could not start live chat. You can create a ticket instead.', 'error');
    } finally {
      setConnectingLive(false);
    }
  };

  const handleSendMessage = async (textOverride) => {
    const text = (textOverride || inputText).trim();
    if (!text) return;

    const userMsg = {
      id: `msg_u_${Date.now()}`,
      sender: 'user',
      text,
      timestamp: nowStamp(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');

    if (isLiveAgentMode && chatSession?.conversationId) {
      try {
        await apiFetch(`/api/v1/support/live-chat/${chatSession.conversationId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
      } catch {
        // fallback
      }
    } else {
      // Simulated Bot assistant reply when not in live agent queue
      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        setMessages((prev) => [
          ...prev,
          {
            id: `msg_bot_${Date.now()}`,
            sender: 'agent',
            agentName: 'OddsYra Assistant',
            text: `Thank you for your message: "${text}". Would you like to connect with a live agent or create a support ticket?`,
            actions: [
              { label: '💬 Connect Live Agent', action: 'connect_agent' },
              { label: '🎫 Open Support Ticket', action: 'create_ticket' },
            ],
            timestamp: nowStamp(),
          },
        ]);
      }, 700);
    }
  };

  const handleAction = (act) => {
    if (act.action === 'connect_agent') {
      startLiveChatSession();
    } else if (act.action === 'create_ticket') {
      setIsOpen(false);
      navigate('/support/tickets/new');
    }
  };

  const handleCreateTicketRedirect = () => {
    setIsOpen(false);
    navigate('/support/tickets/new');
  };

  if (isAdminRoute) return null;

  return (
    <div className="live-chat-wrapper">
      {/* Floating Action Button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            type="button"
            className="live-chat-fab"
            onClick={() => setIsOpen(true)}
            whileHover={hoverScale}
            whileTap={pressScale}
            transition={springUi}
            aria-label="Open support chat"
            style={{
              bottom: isSidebarOpen ? '80px' : '20px',
            }}
          >
            <div className="live-chat-fab-icon">
              <SupportHeadsetIcon size={24} />
            </div>
            <span className="live-chat-fab-label">Support</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Live Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="live-chat-container"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.18 }}
          >
            <div className="live-chat-header">
              <div className="live-chat-header-info">
                <div className="live-chat-avatar">
                  {isLiveAgentMode ? '👤' : '🤖'}
                </div>
                <div>
                  <div className="live-chat-agent-name">
                    {chatSession?.assignedAgentName || (isLiveAgentMode ? 'Live Support Queue' : 'OddsYra Assistant')}{' '}
                    <span className="live-chat-online-badge">
                      <span className="live-chat-dot" /> {chatSession?.status || 'ONLINE'}
                    </span>
                  </div>
                  <div className="live-chat-agent-role">
                    {isLiveAgentMode
                      ? chatSession?.status === 'WAITING'
                        ? 'Waiting for a support agent...'
                        : 'Real-Time Live Chat'
                      : 'Self-Service & Live Agent Gateway'}
                  </div>
                </div>
              </div>
              <div className="live-chat-header-actions">
                <button
                  type="button"
                  className="live-chat-control-btn live-chat-close-btn"
                  onClick={() => setIsOpen(false)}
                  title="Close Chat"
                  aria-label="Close chat"
                >
                  ✕
                </button>
              </div>
            </div>

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
                    onClick={handleCreateTicketRedirect}
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
                      {m.actions?.length > 0 && (
                        <div className="chat-bubble-actions">
                          {m.actions.map((act, idx) => (
                            <button
                              key={`${m.id}_${idx}`}
                              type="button"
                              className="chat-action-btn"
                              onClick={() => handleAction(act)}
                            >
                              {act.label}
                            </button>
                          ))}
                        </div>
                      )}
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
                  onClick={handleCreateTicketRedirect}
                >
                  Submit Support Ticket
                </button>
                <span className="secure-badge">
                  <FiShield /> 256-bit Encrypted
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
