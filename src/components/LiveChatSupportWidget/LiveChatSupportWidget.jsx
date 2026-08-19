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
  FiMessageSquare,
  FiSend,
  FiShield,
} from '../../icons';
import './LiveChatSupportWidget.css';

function storageKey(userId) {
  return `oddsyra_support_chat_v1_${userId || 'guest'}`;
}

function nowStamp() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function welcomeMessage(name) {
  return {
    id: 'welcome_1',
    sender: 'agent',
    text: `Hi ${name || 'there'}. I’m the OddsYra assistant. Tell me what went wrong and I’ll collect the details, then you can open a support ticket. Our team replies on that ticket in Profile → Support.`,
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
  const [intake, setIntake] = useState(() => createEmptyIntake());
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [typingText, setTypingText] = useState('OddsYra Assistant is typing...');
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const messagesEndRef = useRef(null);
  const intakeRef = useRef(intake);
  const messagesRef = useRef(messages);

  intakeRef.current = intake;
  messagesRef.current = messages;

  const isAdminRoute = location.pathname.startsWith('/admin');

  useEffect(() => {
    const saved = loadSavedChat(userId);
    if (saved?.messages?.length) {
      setMessages(saved.messages);
      setIntake({ ...createEmptyIntake(), ...saved.intake });
    } else {
      setMessages([welcomeMessage(displayName)]);
      setIntake(createEmptyIntake());
    }
    setHydrated(true);
  }, [userId, displayName]);

  useEffect(() => {
    if (!hydrated) return;
    saveChat(userId, { messages, intake });
  }, [hydrated, userId, messages, intake]);

  useEffect(() => {
    const openChat = (event) => {
      setIsOpen(true);
      const conversationId = event?.detail?.conversationId;
      if (conversationId) {
        setIntake((prev) => ({ ...prev, conversationId, ticketCreated: true }));
      }
    };
    window.addEventListener('oddsyra:open-support-chat', openChat);
    return () => window.removeEventListener('oddsyra:open-support-chat', openChat);
  }, []);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isTyping]);

  const appendAgent = (text, actions = []) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `msg_agent_${Date.now()}`,
        sender: 'agent',
        agentName: 'OddsYra Assistant',
        text,
        actions,
        timestamp: nowStamp(),
      },
    ]);
  };

  const createTicket = useCallback(async (currentIntake, currentMessages) => {
    if (creatingTicket) return;
    if (!isLoggedIn) {
      showToast('Log in to create a support ticket.', 'info');
      openLoginModal?.();
      return;
    }
    const payload = buildTicketPayload(currentIntake, currentMessages);
    setCreatingTicket(true);
    try {
      const res = await apiFetch('/api/v1/support/tickets', {
        method: 'POST',
        body: JSON.stringify({
          subject: payload.subject,
          category: payload.category,
          initialMessage: payload.initialMessage,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 409) {
        throw new Error(data.error || 'Could not create a support ticket.');
      }
      const ticket = data.ticket || data.conversation || data.activeTicket || {};
      const ticketNumber = ticket.ticketNumber || ticket.conversationNumber || data.ticketNumber;
      const conversationId = ticket.conversationId || data.conversationId;
      if (!ticketNumber && !conversationId) {
        throw new Error('Ticket was not created.');
      }
      const nextIntake = {
        ...currentIntake,
        ticketCreated: true,
        readyForTicket: false,
        step: 'ticket_created',
        ticketNumber: ticketNumber || conversationId,
        conversationId,
      };
      setIntake(nextIntake);
      showToast(`Support ticket ${ticketNumber || conversationId} opened.`, 'success');
      setMessages((prev) => [
        ...prev,
        {
          id: `tck_msg_${Date.now()}`,
          sender: 'system',
          text: `Ticket ${ticketNumber || conversationId} is open. You’ll find it under Profile → Support.`,
          actions: [{ label: 'View my tickets', path: '/profile?tab=support' }],
          timestamp: nowStamp(),
        },
      ]);
      window.dispatchEvent(new CustomEvent('oddsyra:support-ticket-created', {
        detail: { conversationId, ticketNumber },
      }));
    } catch (err) {
      showToast(err.message || 'Could not create a support ticket.', 'error');
    } finally {
      setCreatingTicket(false);
    }
  }, [creatingTicket, isLoggedIn, openLoginModal, showToast]);

  const handleSendMessage = async (textToSend) => {
    const query = (textToSend || inputText || '').trim();
    if (!query || isTyping) return;
    if (!textToSend) setInputText('');

    const userMsg = {
      id: `msg_user_${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: nowStamp(),
    };
    const nextMessages = [...messagesRef.current, userMsg];
    setMessages(nextMessages);

    const existingTicketId = intakeRef.current.conversationId;
    if (existingTicketId && intakeRef.current.ticketCreated && isLoggedIn) {
      try {
        await apiFetch(`/api/v1/support/tickets/${existingTicketId}/messages`, {
          method: 'POST',
          body: JSON.stringify({ text: query }),
        });
      } catch {
        showToast('Message saved locally. Ticket sync will retry next time.', 'info');
      }
    }

    setIsTyping(true);
    const responseObj = nextSupportTurn({
      query,
      intake: intakeRef.current,
      loggedIn: isLoggedIn,
    });
    setTypingText(responseObj.typingText || 'OddsYra Assistant is typing...');
    setIntake(responseObj.intake);

    window.setTimeout(async () => {
      appendAgent(responseObj.response, responseObj.actions);
      setIsTyping(false);
      if (responseObj.shouldCreateTicket) {
        await createTicket(responseObj.intake, [...nextMessages]);
      }
    }, 450);
  };

  const handleCreateTicket = () => {
    if (!isLoggedIn) {
      showToast('Log in to create a support ticket.', 'info');
      openLoginModal?.();
      return;
    }
    createTicket(intakeRef.current, messagesRef.current);
  };

  const handleAction = (act) => {
    if (act.actionType === 'ESCALATE') handleCreateTicket();
    else if (act.actionType === 'LOGIN') openLoginModal?.();
    else if (act.actionType === 'QUERY') handleSendMessage(act.query);
    else if (act.path) navigate(act.path);
  };

  if (isAdminRoute) return null;

  return (
    <div className={`live-chat-support-wrapper${isOpen ? ' live-chat-support-wrapper--open' : ''}${isSidebarOpen ? ' live-chat-support-wrapper--hidden' : ''}`}>
      {!isOpen && (
        <motion.button
          className="live-chat-floating-btn"
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.94 }}
          onClick={() => {
            setIsOpen(true);
          }}
          aria-label="Open OddsYra assistant"
        >
          <span className="live-chat-pulse-dot" />
          <FiMessageSquare className="live-chat-icon" />
          <span className="live-chat-floating-text">Help</span>
        </motion.button>
      )}

      {isOpen && (
        <button
          type="button"
          className="live-chat-backdrop"
          aria-label="Close chat"
          onClick={() => setIsOpen(false)}
        />
      )}

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="live-chat-container"
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            transition={{ duration: 0.25 }}
          >
            <div className="live-chat-header">
              <div className="live-chat-header-info">
                <div className="live-chat-avatar">🤖</div>
                <div>
                  <div className="live-chat-agent-name">
                    OddsYra Assistant{' '}
                    <span className="live-chat-online-badge">
                      <span className="live-chat-dot" /> BOT
                    </span>
                  </div>
                  <div className="live-chat-agent-role">Collects issue details · opens a ticket</div>
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
                  <span aria-hidden="true">×</span>
                  Close
                </button>
              </div>
            </div>

            <div className="live-chat-body">
                  <div className="live-chat-topics-row">
                    <span className="topics-label">Start with:</span>
                    {[
                      ['Withdrawal', 'Withdrawals'],
                      ['Deposit', 'Deposits'],
                      ['Bet Settlement', 'Bets'],
                      ['KYC', 'KYC'],
                      ['Login / OTP', 'Login'],
                    ].map(([query, label]) => (
                      <button
                        key={query}
                        type="button"
                        className="chat-topic-chip"
                        onClick={() => handleSendMessage(`I have a ${query} issue`)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="live-chat-messages-list">
                    {messages.map((m) => (
                      <div key={m.id} className={`chat-bubble-row chat-bubble-row--${m.sender}`}>
                        {m.sender === 'agent' && <div className="chat-bubble-avatar">🤖</div>}
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
                      placeholder="Describe your issue..."
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    />
                    <button
                      type="button"
                      className="live-chat-send-btn"
                      onClick={() => handleSendMessage()}
                      disabled={!inputText.trim() || isTyping}
                    >
                      <FiSend size={18} color="#ffffff" />
                    </button>
                  </div>

                  <div className="live-chat-footer-actions">
                    <button
                      type="button"
                      className="create-ticket-btn"
                      onClick={handleCreateTicket}
                      disabled={creatingTicket}
                    >
                      {creatingTicket
                        ? 'Opening ticket…'
                        : isLoggedIn
                          ? 'Create support ticket'
                          : 'Log in to open a ticket'}
                    </button>
                    <span className="secure-badge">
                      <FiShield /> Saved in Profile → Support
                    </span>
                  </div>
                </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
