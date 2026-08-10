/**
 * Customer Support Platform & Read-Only Bet Investigation Tool
 * Manages customer support tickets and provides authorized read-only investigation data for bets & transactions.
 */

import { sportsDataRegistry } from './sportsDataRegistry.mjs';
import { canonicalMatchStateEngine } from './canonicalMatchState.mjs';

class SupportEngine {
  constructor() {
    this.tickets = new Map(); // ticketId -> Support Ticket
    this.conversations = new Map(); // conversationId -> Support Conversation
    this.knowledgeBase = [
      { id: 'kb_01', title: 'Withdrawal Processing & Timelines', category: 'WITHDRAWAL', content: 'UPI & NetBanking withdrawals are processed within 15 minutes to KYC-verified accounts.' },
      { id: 'kb_02', title: 'Live Match Bet Settlement Rules', category: 'SETTLEMENT', content: 'Bets are settled instantly upon official match event confirmation. In case of rain or abandonment, bets follow official league rules.' },
      { id: 'kb_03', title: 'Deposit Bonus Wagering Requirements', category: 'BONUS', content: 'Deposit bonus funds carry a 5x wagering requirement on sports selections with minimum odds of 1.50.' },
      { id: 'kb_04', title: 'Identity Verification (KYC) Guide', category: 'KYC', content: 'Upload valid PAN Card or Aadhaar Card in your Profile. Verification is completed within 2 hours.' },
    ];

    // Seed default active support conversation for demo
    this.startConversation({
      userId: 'demo@betking.com',
      category: 'WITHDRAWAL',
      initialMessage: 'My withdrawal of ₹1,000 via UPI is still pending.',
      context: { transactionId: 'tx_wd_99182', withdrawalAmount: 1000 },
    });
  }

  startConversation({ userId, category = 'GENERAL', initialMessage = '', context = {} }) {
    const conversationId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const conversation = {
      conversationId,
      userId,
      tenantId: 'betking_in',
      assignedAgent: 'Priya Sharma',
      assignedTeam: category === 'WITHDRAWAL' ? 'PAYMENTS' : 'GENERAL',
      category,
      priority: category === 'WITHDRAWAL' ? 'HIGH' : 'NORMAL',
      status: 'OPEN', // NEW | OPEN | ASSIGNED | WAITING_FOR_USER | WAITING_FOR_SUPPORT | ESCALATED | RESOLVED | CLOSED
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastMessage: initialMessage,
      lastMessageTime: new Date().toISOString(),
      slaStatus: 'HEALTHY', // HEALTHY | WARNING | BREACHED
      context,
      messages: [
        {
          id: `msg_1`,
          sender: 'customer',
          text: initialMessage,
          timestamp: new Date().toISOString(),
          read: true,
        },
        {
          id: `msg_2`,
          sender: 'agent',
          agentName: 'Priya Sharma',
          text: `Hello! I am reviewing your ${category.toLowerCase()} inquiry now. Let me inspect your transaction context.`,
          timestamp: new Date().toISOString(),
          read: true,
        },
      ],
      internalNotes: [
        {
          noteId: `note_1`,
          agentId: 'Priya Sharma',
          text: 'Verified user identity. Checking UPI gateway status on transaction tx_wd_99182.',
          timestamp: new Date().toISOString(),
        },
      ],
      feedback: null,
    };

    this.conversations.set(conversationId, conversation);
    return conversation;
  }

  addMessage(conversationId, { sender, text, agentName = 'Support Agent', attachments = [] }) {
    const conv = this.conversations.get(conversationId);
    if (!conv) return null;

    const msg = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      sender,
      agentName: sender === 'agent' ? agentName : undefined,
      text,
      attachments,
      timestamp: new Date().toISOString(),
      read: true,
    };

    conv.messages.push(msg);
    conv.lastMessage = text;
    conv.lastMessageTime = msg.timestamp;
    conv.updatedAt = msg.timestamp;
    conv.status = sender === 'customer' ? 'WAITING_FOR_SUPPORT' : 'WAITING_FOR_USER';

    return msg;
  }

  addInternalNote(conversationId, { agentId = 'admin', text }) {
    const conv = this.conversations.get(conversationId);
    if (!conv) return null;

    const note = {
      noteId: `note_${Date.now()}`,
      agentId,
      text,
      timestamp: new Date().toISOString(),
    };

    conv.internalNotes.push(note);
    conv.updatedAt = note.timestamp;
    return note;
  }

  assignAgent(conversationId, { agentName, teamId }) {
    const conv = this.conversations.get(conversationId);
    if (!conv) return null;

    conv.assignedAgent = agentName;
    if (teamId) conv.assignedTeam = teamId;
    conv.status = 'ASSIGNED';
    conv.updatedAt = new Date().toISOString();
    return conv;
  }

  resolveConversation(conversationId, { resolutionReason, agentId }) {
    const conv = this.conversations.get(conversationId);
    if (!conv) return null;

    conv.status = 'RESOLVED';
    conv.resolutionReason = resolutionReason || 'Resolved by agent';
    conv.resolvedAt = new Date().toISOString();
    conv.updatedAt = conv.resolvedAt;
    return conv;
  }

  submitFeedback(conversationId, { rating, comment = '' }) {
    const conv = this.conversations.get(conversationId);
    if (!conv) return null;

    conv.feedback = {
      rating: Math.min(5, Math.max(1, parseInt(rating, 10) || 5)),
      comment,
      submittedAt: new Date().toISOString(),
    };
    return conv.feedback;
  }

  getAllConversations() {
    return Array.from(this.conversations.values());
  }

  getUserConversations(userId) {
    return Array.from(this.conversations.values()).filter((c) => c.userId === userId);
  }

  getKnowledgeBase(query = '') {
    if (!query) return this.knowledgeBase;
    const q = query.toLowerCase();
    return this.knowledgeBase.filter(
      (article) => article.title.toLowerCase().includes(q) || article.content.toLowerCase().includes(q)
    );
  }

  getAnalytics() {
    const convs = Array.from(this.conversations.values());
    const totalCount = convs.length;
    const openCount = convs.filter((c) => c.status === 'OPEN' || c.status === 'ASSIGNED' || c.status === 'WAITING_FOR_SUPPORT').length;
    const resolvedCount = convs.filter((c) => c.status === 'RESOLVED' || c.status === 'CLOSED').length;
    const ratings = convs.map((c) => c.feedback?.rating).filter(Boolean);
    const avgCsat = ratings.length > 0 ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : '4.9';

    return {
      totalCount,
      openCount,
      resolvedCount,
      avgFirstResponseTime: '1.4 mins',
      avgResolutionTime: '8.5 mins',
      slaCompliance: '98.5%',
      avgCsat: `${avgCsat} / 5.0`,
    };
  }

  createTicket({ userId, category = 'BETTING_INQUIRY', subject = '', message = '' }) {
    const ticketId = `tck_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const ticket = {
      ticketId,
      userId,
      category,
      subject,
      message,
      status: 'OPEN',
      createdAt: new Date().toISOString(),
      replies: [],
    };

    this.tickets.set(ticketId, ticket);
    return ticket;
  }

  /** Authorized Read-Only Bet Investigation Tool */
  investigateBetContext(matchId) {
    const matchState = canonicalMatchStateEngine.getMatchState(matchId);
    const registryData = sportsDataRegistry.getMatch(matchId);

    return {
      matchId,
      canonicalMatchState: matchState,
      registryMatchData: registryData,
      investigatedAt: new Date().toISOString(),
    };
  }

  getUserTickets(userId) {
    return Array.from(this.tickets.values()).filter((t) => t.userId === userId);
  }
}

export const supportEngine = new SupportEngine();
