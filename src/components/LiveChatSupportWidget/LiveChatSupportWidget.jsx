import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../../context/AuthContext';
import { handleUserSupportQuery } from '../../../lib/supportAssistant.mjs';
import { supportEngine } from '../../../lib/supportEngine.mjs';
import {
  FiMessageSquare,
  FiX,
  FiSend,
  FiMinus,
  FiUser,
  FiShield,
  FiHelpCircle,
  FiCheckCircle,
  FiPhoneCall,
  FiClock,
} from '../../icons';
import './LiveChatSupportWidget.css';

export default function LiveChatSupportWidget() {
  const location = useLocation();

  // Hide support chat widget on all admin portal routes
  if (location.pathname.startsWith('/admin')) {
    return null;
  }

  const { user, showToast } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 'welcome_1',
      sender: 'agent',
      text: `Hello ${user?.displayName || 'Sports Bettor'}! 👋 Welcome to BetKing 24/7 VIP Live Support. How can we help you today?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  const activeAgent = {
    name: 'Priya Sharma',
    role: 'Senior Sportsbook Specialist',
    avatar: '👩‍💼',
    status: 'ONLINE',
  };

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isTyping]);

  const [typingText, setTypingText] = useState('Support is typing...');

  const handleSendMessage = (textToSend) => {
    const query = textToSend || inputText;
    if (!query.trim()) return;

    const userMsg = {
      id: `msg_user_${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputText('');
    setIsTyping(true);

    const responseObj = handleUserSupportQuery(query, user?.email || 'demo@betking.com');
    setTypingText(responseObj.typingText || 'BetKing Assistant is processing...');

    // Simulate AI & Agent response delay
    setTimeout(() => {
      const agentMsg = {
        id: `msg_agent_${Date.now()}`,
        sender: 'agent',
        text: responseObj.response,
        category: responseObj.category,
        actions: responseObj.actions || [],
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, agentMsg]);
      setIsTyping(false);
    }, 800);
  };

  const [csatRating, setCsatRating] = useState(5);
  const [csatComment, setCsatComment] = useState('');
  const [showCsatPrompt, setShowCsatPrompt] = useState(false);

  const handleCreateTicket = () => {
    try {
      const tck = supportEngine.createTicket({
        userId: user?.email || 'guest@betking.com',
        category: 'BETTING_INQUIRY',
        subject: 'Escalated Support Ticket',
        message: messages[messages.length - 1]?.text || 'Live chat escalation',
      });
      showToast(`Support Ticket Created! Ticket ID: #${tck.ticketId}`, 'success');
      setMessages((prev) => [
        ...prev,
        {
          id: `tck_msg_${Date.now()}`,
          sender: 'system',
          text: `🎫 Support Ticket #${tck.ticketId} created successfully. A priority agent will review your case shortly.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
      setShowCsatPrompt(true);
    } catch (err) {
      showToast('Failed to generate ticket', 'error');
    }
  };

  const handleSubmitCsat = (ratingVal) => {
    setCsatRating(ratingVal);
    showToast(`Thank you for your ${ratingVal}-star support feedback!`, 'success');
    setShowCsatPrompt(false);
  };

  return (
    <div className="live-chat-support-wrapper">
      {/* FLOATING LAUNCHER BUTTON */}
      {!isOpen && (
        <motion.button
          className="live-chat-floating-btn"
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.94 }}
          onClick={() => {
            setIsOpen(true);
            setIsMinimized(false);
          }}
          aria-label="Open 24/7 Live Support Chat"
        >
          <span className="live-chat-pulse-dot" />
          <FiMessageSquare className="live-chat-icon" />
          <span className="live-chat-floating-text">24/7 Live Support</span>
        </motion.button>
      )}

      {/* CHAT WINDOW MODAL */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className={`live-chat-container ${isMinimized ? 'live-chat-container--minimized' : ''}`}
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            transition={{ duration: 0.25 }}
          >
            {/* CHAT HEADER */}
            <div className="live-chat-header">
              <div className="live-chat-header-info">
                <div className="live-chat-avatar">{activeAgent.avatar}</div>
                <div>
                  <div className="live-chat-agent-name">
                    {activeAgent.name}{' '}
                    <span className="live-chat-online-badge">
                      <span className="live-chat-dot" /> 24/7 LIVE
                    </span>
                  </div>
                  <div className="live-chat-agent-role">{activeAgent.role}</div>
                </div>
              </div>
              <div className="live-chat-header-actions">
                <button
                  type="button"
                  className="live-chat-control-btn"
                  onClick={() => setIsMinimized(!isMinimized)}
                  title={isMinimized ? 'Expand Chat' : 'Minimize Chat'}
                >
                  <FiMinus />
                </button>
                <button
                  type="button"
                  className="live-chat-control-btn"
                  onClick={() => setIsOpen(false)}
                  title="Close Chat"
                >
                  <FiX />
                </button>
              </div>
            </div>

            {/* CHAT BODY */}
            {!isMinimized && (
              <>
                <div className="live-chat-body">
                  {/* TOPIC CHIPS QUICK SELECT */}
                  <div className="live-chat-topics-row">
                    <span className="topics-label">Quick Topics:</span>
                    <button
                      type="button"
                      className="chat-topic-chip"
                      onClick={() => handleSendMessage('What is my withdrawal status?')}
                    >
                      ⚡ Withdrawals
                    </button>
                    <button
                      type="button"
                      className="chat-topic-chip"
                      onClick={() => handleSendMessage('How are live bets settled?')}
                    >
                      🎯 Settlement
                    </button>
                    <button
                      type="button"
                      className="chat-topic-chip"
                      onClick={() => handleSendMessage('How to claim deposit bonus?')}
                    >
                      🎁 Bonuses
                    </button>
                    <button
                      type="button"
                      className="chat-topic-chip"
                      onClick={() => handleSendMessage('How to verify my account KYC?')}
                    >
                      🛡️ KYC Rules
                    </button>
                  </div>

                  {/* MESSAGES LIST */}
                  <div className="live-chat-messages-list">
                    {messages.map((m) => (
                      <div key={m.id} className={`chat-bubble-row chat-bubble-row--${m.sender}`}>
                        {m.sender === 'agent' && <div className="chat-bubble-avatar">🤖</div>}
                        <div className={`chat-bubble chat-bubble--${m.sender}`}>
                          <p>{m.text}</p>

                          {/* SMART ACTION BUTTONS */}
                          {m.actions && m.actions.length > 0 && (
                            <div className="chat-bubble-actions mt-2 flex flex-wrap gap-1.5">
                              {m.actions.map((act, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  className="chat-action-btn text-[11px] font-bold px-2.5 py-1 rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/40 hover:bg-blue-500/30 transition-all cursor-pointer"
                                  onClick={() => {
                                    if (act.actionType === 'ESCALATE') handleCreateTicket();
                                    else if (act.actionType === 'QUERY') handleSendMessage(act.query);
                                    else if (act.path) window.location.href = act.path;
                                  }}
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

                    {/* TYPING INDICATOR */}
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

                {/* CHAT FOOTER INPUT */}
                <div className="live-chat-footer">
                  <div className="live-chat-input-bar">
                    <input
                      type="text"
                      placeholder="Type your message or query..."
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    />
                    <button
                      type="button"
                      className="live-chat-send-btn"
                      onClick={() => handleSendMessage()}
                      disabled={!inputText.trim()}
                    >
                      <FiSend />
                    </button>
                  </div>

                  <div className="live-chat-footer-actions">
                    <button type="button" className="create-ticket-btn" onClick={handleCreateTicket}>
                      🎫 Escalate to Priority Ticket
                    </button>
                    <span className="secure-badge">
                      <FiShield /> 256-bit Encrypted
                    </span>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
