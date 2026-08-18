/**
 * Support intake assistant — collects issue details, then asks the user to open a ticket.
 * Does not invent account, KYC, or payment status.
 */

export const SUPPORT_INTAKE_CATEGORIES = [
  'Withdrawal',
  'Deposit',
  'Betting',
  'Bet Settlement',
  'KYC',
  'Bonus / Promotion',
  'Account',
  'Login / OTP',
  'Technical Issue',
  'Responsible Gaming',
  'Payment',
  'Other',
];

const CATEGORY_FOLLOW_UPS = {
  Withdrawal: 'What amount, payout method (UPI, bank, etc.), and roughly when did you request it?',
  Deposit: 'What amount, payment method, and roughly when did you try to deposit?',
  Betting: 'Which match or market, and the stake or bet ID if you have it?',
  'Bet Settlement': 'Which match was settled, what was the stake, and what result did you expect?',
  KYC: 'What did you upload (PAN / Aadhaar / other), and what error or status do you see?',
  'Bonus / Promotion': 'Which promo or bonus, and what went wrong when you tried to use it?',
  Account: 'What were you trying to do, and what error or unexpected behaviour did you see?',
  'Login / OTP': 'Are you stuck on login, OTP, or password reset? Include the email or phone you used.',
  'Technical Issue': 'Which page or action failed, and what device or browser are you using?',
  'Responsible Gaming': 'Do you need a limit change, cool-off, or self-exclusion? Tell me what you want set.',
  Payment: 'Was this a deposit or withdrawal? Include amount, method, and any payment reference.',
  Other: 'Please describe what happened, including dates, amounts, or IDs if you have them.',
};

export function createEmptyIntake() {
  return {
    step: 'start',
    category: null,
    summary: '',
    details: '',
    amount: '',
    method: '',
    reference: '',
    when: '',
    readyForTicket: false,
    ticketCreated: false,
    ticketNumber: null,
    conversationId: null,
  };
}

export function classifyIntent(queryText = '') {
  const q = String(queryText).toLowerCase().trim();
  if (/withdraw|payout|upi payout|pending money|cash.?out to (bank|upi)/i.test(q)) return 'Withdrawal';
  if (/deposit|add money|recharge|payment failed|utr/i.test(q)) return 'Deposit';
  if (/settle|settlement|won|lost|void|payout of (my )?bet/i.test(q)) return 'Bet Settlement';
  if (/\bbet\b|odds|stake|match|market/i.test(q)) return 'Betting';
  if (/kyc|verification|aadhaar|pan card|identity|document/i.test(q)) return 'KYC';
  if (/bonus|freebet|promo|wagering|cashback/i.test(q)) return 'Bonus / Promotion';
  if (/otp|password|login|sign in|2fa/i.test(q)) return 'Login / OTP';
  if (/limit|exclude|self-exclusion|cool.?off|responsible/i.test(q)) return 'Responsible Gaming';
  if (/crash|bug|error|page|app not|not loading|technical/i.test(q)) return 'Technical Issue';
  if (/account|profile|restrict|block|email/i.test(q)) return 'Account';
  if (/payment|razorpay|gateway/i.test(q)) return 'Payment';
  if (/hi|hello|hey|greetings/.test(q) && q.length < 24) return 'GREETING';
  if (/agent|human|representative|talk to (someone|a person)|speak to/i.test(q)) return 'HANDOFF';
  return null;
}

export function extractIssueFacts(text = '') {
  const raw = String(text);
  const amountMatch = raw.match(/(?:₹|rs\.?\s*|inr\s*)\s*(\d{1,3}(?:,\d{3})+|\d{2,7})/i)
    || raw.match(/(\d{1,3}(?:,\d{3})+|\d{2,7})\s*(?:rs|inr|rupees)\b/i);
  const methodMatch = raw.match(/\b(upi|gpay|google\s*pay|phonepe|paytm|imps|neft|netbanking|net banking|bank(?:\s*transfer)?|card|razorpay)\b/i);
  const referenceMatch = raw.match(/\b(?:id|ref|utr|txn|transaction|bet(?:\s*id)?|ticket)\s*[:#-]?\s*([a-z0-9_-]{4,})\b/i);
  const whenMatch = raw.match(/\b(\d+\s*(?:min(?:ute)?s?|hours?|hrs?|days?)\s*ago|yesterday|today|this morning)\b/i);

  return {
    amount: amountMatch ? amountMatch[1].replace(/,/g, '') : '',
    method: methodMatch ? methodMatch[1].replace(/\s+/g, ' ') : '',
    reference: referenceMatch ? referenceMatch[1] : '',
    when: whenMatch ? whenMatch[1] : '',
  };
}

function mergeFacts(intake, query) {
  const facts = extractIssueFacts(query);
  const next = { ...intake };
  if (facts.amount && !next.amount) next.amount = facts.amount;
  if (facts.method && !next.method) next.method = facts.method;
  if (facts.reference && !next.reference) next.reference = facts.reference;
  if (facts.when && !next.when) next.when = facts.when;
  return next;
}

function isSkip(query) {
  return /^(skip|none|n\/a|na|no|nope|don'?t have|do not have|not sure|idk|i don'?t know)\b/i.test(String(query).trim());
}

function isAffirmative(query) {
  return /^(yes|yeah|yep|y|ok|okay|sure|please|go ahead|create|open( a)? ticket|submit)\b/i.test(String(query).trim());
}

function isTicketRequest(query) {
  return /\b(create|open|raise|submit|make)\b.*\b(ticket|request)\b|\bticket\b.*\b(please|now)\b/i.test(String(query).trim());
}

function applySkip(intake) {
  const next = { ...intake };
  if (!next.details || next.details.trim().length < 8) {
    next.details = next.details || 'User preferred not to add more description.';
    return next;
  }
  if (!next.amount && /Withdrawal|Deposit|Payment|Betting|Bet Settlement/.test(next.category || '')) {
    next.amount = 'not provided';
    return next;
  }
  if (!next.method && /Withdrawal|Deposit|Payment/.test(next.category || '')) {
    next.method = 'not provided';
    return next;
  }
  if (!next.reference) {
    next.reference = 'not provided';
  }
  return next;
}

function missingFollowUp(intake) {
  if (!intake.details || intake.details.trim().length < 8) {
    return CATEGORY_FOLLOW_UPS[intake.category] || CATEGORY_FOLLOW_UPS.Other;
  }
  if (!intake.amount && /Withdrawal|Deposit|Payment|Betting|Bet Settlement/.test(intake.category || '')) {
    return 'What amount is involved? You can type skip if it does not apply.';
  }
  if (!intake.method && /Withdrawal|Deposit|Payment/.test(intake.category || '')) {
    return 'Which method did you use (UPI, bank, Paytm, card)? Type skip if you are not sure.';
  }
  if (!intake.reference) {
    return 'If you have a transaction ID, UTR, or bet ID, paste it now. Otherwise type skip.';
  }
  return null;
}

function summarizeIntake(intake) {
  const lines = [
    `Category: ${intake.category || 'Other'}`,
    intake.summary ? `Summary: ${intake.summary}` : null,
    intake.amount ? `Amount: ₹${intake.amount}` : null,
    intake.method ? `Method: ${intake.method}` : null,
    intake.when ? `When: ${intake.when}` : null,
    intake.reference ? `Reference: ${intake.reference}` : null,
    `Details: ${intake.details || 'Not provided'}`,
  ].filter(Boolean);
  return lines.join('\n');
}

export function buildTicketPayload(intake, messages = []) {
  const category = SUPPORT_INTAKE_CATEGORIES.includes(intake?.category) ? intake.category : 'Other';
  const subject = (intake?.summary || `${category} support request`).slice(0, 120);
  const transcript = (messages || [])
    .filter((m) => m && m.text && m.sender !== 'system')
    .map((m) => `${m.sender === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
    .join('\n');

  const initialMessage = [
    'Issue details collected in chat',
    summarizeIntake(intake || createEmptyIntake()),
    '',
    'Chat transcript',
    transcript || (intake?.details || 'No transcript'),
  ].join('\n');

  return { subject, category, initialMessage };
}

function reply(intake, response, extra = {}) {
  return {
    query: extra.query || '',
    intent: intake.category || extra.intent || 'GENERAL',
    category: intake.category || 'Other',
    response,
    typingText: extra.typingText || 'OddsYra Assistant is typing...',
    actions: extra.actions || [],
    intake,
    shouldCreateTicket: Boolean(extra.shouldCreateTicket),
    timestamp: new Date().toISOString(),
  };
}

function ticketActions(loggedIn) {
  if (loggedIn === false) {
    return [{ label: 'Log in to open a ticket', actionType: 'LOGIN' }];
  }
  return [
    { label: 'Create support ticket', actionType: 'ESCALATE' },
  ];
}

/**
 * Advance the intake conversation by one user message.
 * `loggedIn` only affects ticket CTAs — guests can still describe the issue.
 */
export function nextSupportTurn({ query = '', intake = createEmptyIntake(), loggedIn = false } = {}) {
  const text = String(query || '').trim();
  let next = mergeFacts({ ...createEmptyIntake(), ...intake }, text);

  if (next.ticketCreated && next.conversationId) {
    if (text) {
      next.details = [next.details, text].filter(Boolean).join('\n');
    }
    return reply(next, `I’ve noted that against ticket ${next.ticketNumber}. You can also read and reply in Profile → Support.`, {
      query: text,
      actions: [{ label: 'View my tickets', path: '/profile?tab=support' }],
    });
  }

  if (!text) {
    return reply(next, 'Tell me what went wrong — for example a withdrawal, deposit, bet, or login issue.', { query: text });
  }

  if (next.step === 'start' || next.step === 'category') {
    const greeting = classifyIntent(text) === 'GREETING';
    if (greeting) {
      next.step = 'category';
      return reply(next, 'Hi. I’m the OddsYra assistant. What do you need help with — withdrawal, deposit, bet, KYC, bonus, login, or something else?', {
        query: text,
        intent: 'GREETING',
      });
    }

    const category = classifyIntent(text);
    if (category && category !== 'HANDOFF' && category !== 'GREETING') {
      next.category = category;
    } else if (SUPPORT_INTAKE_CATEGORIES.includes(text)) {
      next.category = text;
    }

    if (!next.category) {
      next.step = 'category';
      next.details = text;
      return reply(next, 'I can open a ticket once I know the topic. Is this about a withdrawal, deposit, bet settlement, KYC, bonus, login, or something else?', {
        query: text,
      });
    }

    next.summary = text.slice(0, 120);
    next.details = text;
    next.step = 'details';
    const followUp = missingFollowUp(next);
    if (followUp) {
      return reply(next, `Got it — this looks like a ${next.category} issue. ${followUp}`, { query: text });
    }
  }

  if (next.step === 'details' || next.step === 'reference' || next.step === 'confirm') {
    if (text && !isSkip(text) && !isAffirmative(text) && !isTicketRequest(text)) {
      next.details = next.details && next.details !== text
        ? `${next.details}\n${text}`
        : (next.details || text);
      if (!next.summary) next.summary = text.slice(0, 120);
    }

    if (isSkip(text)) {
      next = applySkip(next);
    }

    const followUp = missingFollowUp(next);
    if (followUp && !isTicketRequest(text) && !isAffirmative(text)) {
      next.step = 'reference';
      return reply(next, followUp, { query: text });
    }

    next.step = 'confirm';
    next.readyForTicket = true;

    if (isTicketRequest(text) || isAffirmative(text)) {
      return reply(next, `I have enough to open a ticket:\n${summarizeIntake(next)}\n\n${loggedIn ? 'Creating your support ticket now.' : 'Log in to create the ticket. It will appear under Profile → Support.'}`, {
        query: text,
        shouldCreateTicket: Boolean(loggedIn),
        actions: ticketActions(loggedIn),
      });
    }

    return reply(next, `Here is what I have:\n${summarizeIntake(next)}\n\nShould I create a support ticket with these details? Our team replies on that ticket in Profile → Support.`, {
      query: text,
      actions: ticketActions(loggedIn),
    });
  }

  if (classifyIntent(text) === 'HANDOFF' || isTicketRequest(text)) {
    next.readyForTicket = Boolean(next.details);
    next.step = next.details ? 'confirm' : 'details';
    if (!next.details) {
      return reply(next, 'I can open a ticket for a person to review. First tell me what happened, including amounts or IDs if you have them.', { query: text });
    }
    return reply(next, `I can create a ticket from this:\n${summarizeIntake(next)}\n\nCreate it now?`, {
      query: text,
      shouldCreateTicket: Boolean(loggedIn && next.readyForTicket && isTicketRequest(text)),
      actions: ticketActions(loggedIn),
    });
  }

  next.details = [next.details, text].filter(Boolean).join('\n');
  next.step = 'confirm';
  next.readyForTicket = true;
  return reply(next, `Thanks. Updated details:\n${summarizeIntake(next)}\n\nCreate a support ticket with this?`, {
    query: text,
    actions: ticketActions(loggedIn),
  });
}

export function handleUserSupportQuery(queryText = '', _userId = '', intake = createEmptyIntake(), loggedIn = false) {
  return nextSupportTurn({ query: queryText, intake, loggedIn });
}
