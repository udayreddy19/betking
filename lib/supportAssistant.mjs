/**
 * Enterprise AI Support Assistant — OddsYra Enterprise Platform (lib/supportAssistant.mjs)
 * Intelligent intent recognition & dynamic backend context retrieval engine.
 */

// Simulated authoritative backend user states for dynamic responses
const MOCK_USER_BACKEND_STATES = {
  'demo@oddsyra.com': {
    kycStatus: 'VERIFIED',
    kycDetails: 'Aadhaar & PAN verified on 2026-08-01. Account fully authorized for unlimited withdrawals.',
    latestWithdrawal: { id: 'tx_wd_99182', amount: 1000, method: 'UPI', status: 'IN_PROGRESS', createdAt: '10 mins ago' },
    activeBetsCount: 2,
    accountStatus: 'ACTIVE',
    riskTier: 'LOW_RISK',
  },
  'default': {
    kycStatus: 'UNDER_REVIEW',
    kycDetails: 'Your KYC documents (PAN & Aadhaar) are currently under review by our Compliance Team.',
    latestWithdrawal: { id: 'tx_wd_001', amount: 500, method: 'NetBanking', status: 'COMPLETED', createdAt: '1 hour ago' },
    activeBetsCount: 1,
    accountStatus: 'ACTIVE',
    riskTier: 'NORMAL',
  },
};

export function classifyIntent(queryText = '') {
  const q = String(queryText).toLowerCase().trim();

  if (/kyc|verification|verify|aadhaar|pan|identity|document|approve/i.test(q)) {
    return 'KYC_STATUS';
  }
  if (/withdraw|payout|transfer money|cashout bank|upi payout|pending money/i.test(q)) {
    return 'WITHDRAWAL_STATUS';
  }
  if (/deposit|add money|recharge|payment failed|utr/i.test(q)) {
    return 'DEPOSIT_STATUS';
  }
  if (/bet|ticket|match|won|lost|rejected|settle|odds/i.test(q)) {
    return 'BET_STATUS';
  }
  if (/account|login|restrict|block|password|profile/i.test(q)) {
    return 'ACCOUNT_STATUS';
  }
  if (/bonus|freebet|promo|wagering|cashback/i.test(q)) {
    return 'PROMOTION_STATUS';
  }
  if (/limit|exclude|self-exclusion|cool off|gambling|harm/i.test(q)) {
    return 'RESPONSIBLE_GAMING';
  }
  if (/agent|person|human|representative|talk|speak/i.test(q)) {
    return 'HUMAN_AGENT_HANDOFF';
  }
  if (/hi|hello|hey|greetings/i.test(q)) {
    return 'GREETING';
  }

  return 'GENERAL_FALLBACK';
}

export function handleUserSupportQuery(queryText = '', userId = 'demo@oddsyra.com') {
  const intent = classifyIntent(queryText);
  const userState = MOCK_USER_BACKEND_STATES[userId] || MOCK_USER_BACKEND_STATES['default'];

  let response = '';
  let category = 'GENERAL';
  let typingText = 'OddsYra Assistant is processing...';
  let actions = [];

  switch (intent) {
    case 'KYC_STATUS': {
      category = 'KYC';
      typingText = 'Checking your official KYC verification status...';

      if (userState.kycStatus === 'VERIFIED') {
        response = `Your KYC status is **VERIFIED** ✅ (${userState.kycDetails}). Your account is fully compliant and unlocked for instant withdrawals!`;
        actions = [
          { label: '👤 View Profile', path: '/profile' },
          { label: '💳 Make Withdrawal', path: '/profile' },
        ];
      } else if (userState.kycStatus === 'UNDER_REVIEW') {
        response = `Your KYC verification is currently **UNDER REVIEW** ⏳ by our Compliance Team. Document processing typically takes under 2 hours. We will send you an SMS/Push alert as soon as verification is complete!`;
        actions = [
          { label: '📄 View Document Status', path: '/profile' },
          { label: '🎧 Talk to Specialist', actionType: 'ESCALATE' },
        ];
      } else {
        response = `Your KYC status requires action. Please upload your valid PAN Card or Aadhaar Card in your Profile to unlock withdrawals.`;
        actions = [
          { label: '📄 Upload KYC Documents', path: '/profile' },
        ];
      }
      break;
    }

    case 'WITHDRAWAL_STATUS': {
      category = 'WALLET';
      typingText = 'Inspecting your latest withdrawal transaction...';
      const wd = userState.latestWithdrawal;

      if (wd) {
        response = `Your latest withdrawal of **₹${wd.amount.toLocaleString()}** via **${wd.method}** (ID: \`${wd.id}\`) requested ${wd.createdAt} is currently **${wd.status.replace('_', ' ')}**. Payouts to verified UPI accounts process within 15 minutes!`;
        actions = [
          { label: '📊 View Transaction Trace', path: '/profile' },
          { label: '🎧 Escalate Payout Ticket', actionType: 'ESCALATE' },
        ];
      } else {
        response = `You have no pending withdrawals. Withdrawals are processed 24/7 to verified bank and UPI accounts.`;
        actions = [
          { label: '💳 Request Withdrawal', path: '/profile' },
        ];
      }
      break;
    }

    case 'DEPOSIT_STATUS': {
      category = 'WALLET';
      typingText = 'Checking payment gateway status...';
      response = `Instant UPI, GooglePay, PhonePe, Paytm, and NetBanking deposits are active. Funds reflect in your main balance immediately upon UTR confirmation.`;
      actions = [
        { label: '⚡ Deposit Now', path: '/profile' },
      ];
      break;
    }

    case 'BET_STATUS': {
      category = 'SETTLEMENT';
      typingText = 'Reviewing your active bets & settlement scorecard...';
      response = `You currently have **${userState.activeBetsCount} active bet(s)** in play. Bets are settled automatically as soon as official match scorecards are confirmed by our feed providers.`;
      actions = [
        { label: '🏏 View My Bets', path: '/profile' },
      ];
      break;
    }

    case 'ACCOUNT_STATUS': {
      category = 'ACCOUNT';
      typingText = 'Verifying account status & security parameters...';
      response = `Your account is **ACTIVE** and operating under **${userState.riskTier.replace('_', ' ')}** parameters. Two-Factor Authentication and session security are active.`;
      actions = [
        { label: '🔒 Security Settings', path: '/profile' },
      ];
      break;
    }

    case 'PROMOTION_STATUS': {
      category = 'PROMOTIONS';
      typingText = 'Checking active bonus offers & promo codes...';
      response = `Active Promotion: **100% Sports Welcome Bonus** up to ₹10,000! Bonus funds carry a 5x wagering requirement on sports selections with minimum odds of 1.50.`;
      actions = [
        { label: '🎁 Claim Bonus', path: '/promotions' },
      ];
      break;
    }

    case 'RESPONSIBLE_GAMING': {
      category = 'RESPONSIBLE_GAMING';
      typingText = 'Loading Responsible Gaming resources...';
      response = `OddsYra promotes safe, responsible gaming. You can set custom daily deposit limits, loss limits, or activate self-exclusion anytime in your Profile.`;
      actions = [
        { label: '🛡️ Responsible Gaming Controls', path: '/responsible-gaming' },
      ];
      break;
    }

    case 'HUMAN_AGENT_HANDOFF': {
      category = 'ESCALATION';
      typingText = 'Connecting to Senior Support Agent...';
      response = `I am transferring your conversation to Senior Sportsbook Specialist **Priya Sharma**. An agent will take over this thread immediately.`;
      actions = [
        { label: '🎫 Priority Support Ticket', actionType: 'ESCALATE' },
      ];
      break;
    }

    case 'GREETING': {
      category = 'GENERAL';
      typingText = 'OddsYra Assistant is typing...';
      response = `Hello! 👋 How can I help you today? You can ask me about your **KYC Status**, **Withdrawal Payouts**, **Bets**, or **Bonus Rewards**!`;
      break;
    }

    default: {
      category = 'GENERAL';
      typingText = 'Searching knowledge base...';
      response = `I can help check your **KYC verification**, **Withdrawal status**, **Active bets**, or **Account settings**. Please select a topic or type your specific question!`;
      actions = [
        { label: '🆔 Check KYC Status', actionType: 'QUERY', query: 'I want to know the status of my kyc' },
        { label: '💳 Check Withdrawal Status', actionType: 'QUERY', query: 'Where is my withdrawal?' },
        { label: '🎧 Talk to Specialist', actionType: 'ESCALATE' },
      ];
      break;
    }
  }

  return {
    userId,
    query: queryText,
    intent,
    category,
    response,
    typingText,
    actions,
    timestamp: new Date().toISOString(),
  };
}

