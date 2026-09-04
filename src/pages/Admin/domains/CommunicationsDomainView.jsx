import React, { useState, useEffect, useMemo } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import { useAdminToast } from '../components/AdminToastContext';
import { StatusBadge } from '../components/AdminBadge';
import { AdminHub } from '../components/AdminTabs';
import AdminConfirmDialog from '../components/AdminConfirmDialog';

const FAILED_STATUSES = new Set(['FAILED', 'ERROR', 'DEAD_LETTER', 'DLQ', 'BOUNCED', 'REJECTED']);

const FALLBACK_MAILBOXES = [
  { id: 'no-reply', email: 'no-reply@oddsyra.com', label: 'No-reply', description: 'Transactional / security notices' },
  { id: 'promos', email: 'promos@oddsyra.com', label: 'Promotions', description: 'Marketing and campaign emails' },
  { id: 'support', email: 'support@oddsyra.com', label: 'Support', description: 'Player support replies' },
  { id: 'alerts', email: 'alerts@oddsyra.com', label: 'Alerts', description: 'Ops / SLA notifications' },
];

const FALLBACK_TEMPLATES = [
  { id: 'blank', name: 'Blank', group: 'core', heading: 'Message from OddsYra', subject: '', body: '', ctaLabel: '', ctaPath: '', mailboxId: 'no-reply' },
  { id: 'support-update', name: 'Support update', group: 'core', heading: 'Update on your support request', subject: 'Update from OddsYra Support', body: 'Thanks for contacting OddsYra Support.\n\nWe have reviewed your request and wanted to share a quick update.\n\nIf you still need help, reply to this email or open your ticket in the app.', ctaLabel: 'Open support', ctaPath: '/profile?tab=support', mailboxId: 'support' },
  { id: 'account-notice', name: 'Account notice', group: 'core', heading: 'Account notice', subject: 'Important notice about your OddsYra account', body: 'We are writing with an important update about your OddsYra account.\n\nPlease review the details below and take any action required.\n\nIf this does not look right, contact support immediately.', ctaLabel: 'View account', ctaPath: '/profile', mailboxId: 'no-reply' },
  { id: 'promo-announce', name: 'Promo announcement', group: 'core', heading: 'A special offer for you', subject: 'Exclusive offer from OddsYra', body: 'We have a limited-time offer waiting for you on OddsYra.\n\nClaim it before it expires — terms apply.', ctaLabel: 'View promotions', ctaPath: '/promotions', mailboxId: 'promos' },
  { id: 'kyc-nudge', name: 'KYC reminder', group: 'core', heading: 'Complete your KYC', subject: 'Finish KYC to unlock full OddsYra access', body: 'Your OddsYra account is almost ready.\n\nComplete KYC verification to unlock higher limits and withdrawals.\n\nIt only takes a few minutes.', ctaLabel: 'Complete KYC', ctaPath: '/profile?tab=kyc', mailboxId: 'no-reply' },
  { id: 'welcome-back', name: 'Welcome back', group: 'core', heading: 'Welcome back to OddsYra', subject: 'We saved your spot at OddsYra', body: 'It has been a while — markets are live and fresh offers are waiting.\n\nLog in to pick up where you left off.', ctaLabel: 'Open OddsYra', ctaPath: '/sports', mailboxId: 'promos' },
  { id: 'ticket-closed', name: 'Ticket closed', group: 'ops', heading: 'Your support ticket is resolved', subject: 'Your OddsYra support ticket is closed', body: 'We have closed your support ticket as resolved.\n\nIf anything is still outstanding, reply to this email or reopen the ticket from your profile.', ctaLabel: 'View ticket', ctaPath: '/profile?tab=support', mailboxId: 'support' },
  { id: 'kyc-rejected', name: 'KYC rejected', group: 'ops', heading: 'KYC needs another look', subject: 'Please resubmit your OddsYra KYC documents', body: 'We could not verify your KYC documents this time.\n\nPlease upload clear, matching ID and address documents from your profile. Withdrawals stay limited until KYC is approved.', ctaLabel: 'Resubmit KYC', ctaPath: '/profile?tab=kyc', mailboxId: 'no-reply' },
  { id: 'security-alert', name: 'Security alert', group: 'ops', heading: 'Security notice', subject: 'Security notice for your OddsYra account', body: 'We noticed a security-related change on your OddsYra account.\n\nIf this was you, no action is needed. If it was not, change your password and contact support immediately.', ctaLabel: 'Secure account', ctaPath: '/profile', mailboxId: 'no-reply' },
  { id: 'withdrawal-help', name: 'Withdrawal help', group: 'ops', heading: 'About your withdrawal', subject: 'Update on your OddsYra withdrawal', body: 'We are writing about your recent withdrawal request.\n\nPlease keep your UPI / bank details ready. If we need anything else, reply to this email and our support team will follow up.', ctaLabel: 'Open wallet', ctaPath: '/wallet', mailboxId: 'support' },
  { id: 'deposit-help', name: 'Deposit help', group: 'ops', heading: 'Need help depositing?', subject: 'Help with your OddsYra deposit', body: 'If a deposit did not show in your wallet, check the payment app first.\n\nIf the amount was deducted but not credited, reply with the UTR / reference and we will look into it.', ctaLabel: 'Open wallet', ctaPath: '/wallet', mailboxId: 'support' },
  { id: 'free-bet', name: 'Free bet', group: 'ops', heading: 'Your free bet is waiting', subject: 'A free bet has been added to your OddsYra account', body: 'A free bet is ready on your OddsYra account.\n\nOpen Sports, pick a market, and use the free bet before it expires. Stake is not returned.', ctaLabel: 'Use free bet', ctaPath: '/sports', mailboxId: 'promos' },
  { id: 'bonus-expiry', name: 'Bonus expiry', group: 'ops', heading: 'Your bonus is about to expire', subject: 'Your OddsYra bonus expires soon', body: 'A bonus or free bet on your account is close to expiry.\n\nLog in and use it before it lapses. Unused rewards cannot be restored after expiry.', ctaLabel: 'View rewards', ctaPath: '/rewards', mailboxId: 'promos' },
  { id: 'vip-perk', name: 'VIP perk', group: 'ops', heading: 'A VIP perk for you', subject: 'Your OddsYra VIP perk is ready', body: 'Thanks for playing with OddsYra — a VIP perk is waiting on your account.\n\nOpen Rewards to review the details and claim it.', ctaLabel: 'View VIP', ctaPath: '/rewards', mailboxId: 'promos' },
  { id: 'referral', name: 'Referral', group: 'ops', heading: 'Invite friends, earn rewards', subject: 'Share OddsYra and earn referral rewards', body: 'Invite friends to OddsYra with your referral link.\n\nWhen they verify, you both can earn a free bet. Open your profile to copy your code.', ctaLabel: 'Get referral link', ctaPath: '/profile', mailboxId: 'promos' },
  { id: 'responsible-gaming', name: 'Responsible gaming', group: 'ops', heading: 'Play within your limits', subject: 'Set limits on your OddsYra account', body: 'You can set deposit, loss, and session limits any time from your OddsYra profile.\n\nIf you need a break, use time-out or self-exclusion. Help is always available.', ctaLabel: 'Set limits', ctaPath: '/profile?tab=responsible-gaming', mailboxId: 'support' },
  { id: 'account-hold', name: 'Account hold', group: 'ops', heading: 'Your account needs a review', subject: 'Action needed on your OddsYra account', body: 'We have placed a temporary review on your OddsYra account.\n\nBetting or withdrawals may be limited until this is cleared. Reply to this email if you have questions.', ctaLabel: 'Contact support', ctaPath: '/profile?tab=support', mailboxId: 'alerts' },
  { id: 'need-info', name: 'Need more info', group: 'more', heading: 'We need a bit more information', subject: 'OddsYra Support needs a few details', body: 'Thanks for writing in.\n\nTo finish this request we need a little more information from you. Reply to this email with the details and we will pick it up right away.', ctaLabel: 'Reply in app', ctaPath: '/profile?tab=support', mailboxId: 'support' },
  { id: 'looking-into-it', name: 'Looking into it', group: 'more', heading: 'We are looking into this', subject: 'OddsYra Support is reviewing your request', body: 'We have received your request and our team is reviewing it now.\n\nNo action is needed from you yet. We will email you as soon as we have an update.', ctaLabel: 'Open support', ctaPath: '/profile?tab=support', mailboxId: 'support' },
  { id: 'delay-apology', name: 'Delay apology', group: 'more', heading: 'Sorry for the delay', subject: 'Sorry for the wait — OddsYra Support', body: 'Sorry this has taken longer than it should.\n\nYour request is still open with our team and we are treating it as a priority. We will come back to you shortly.', ctaLabel: 'Open ticket', ctaPath: '/profile?tab=support', mailboxId: 'support' },
  { id: 'kyc-approved', name: 'KYC approved', group: 'more', heading: 'Your KYC is approved', subject: 'Your OddsYra account is fully verified', body: 'Your KYC documents have been approved.\n\nYour OddsYra account is now fully verified, with higher limits and withdrawals unlocked.', ctaLabel: 'View account', ctaPath: '/profile', mailboxId: 'no-reply' },
  { id: 'withdrawal-paid', name: 'Withdrawal paid', group: 'more', heading: 'Your withdrawal has been paid', subject: 'Your OddsYra withdrawal has been sent', body: 'Your withdrawal has been paid from OddsYra.\n\nPlease check your UPI or bank app. If it does not show in a few minutes, reply with the UTR and we will check the payout.', ctaLabel: 'Open wallet', ctaPath: '/wallet', mailboxId: 'support' },
  { id: 'withdrawal-declined', name: 'Withdrawal declined', group: 'more', heading: 'Your withdrawal could not be paid', subject: 'Update on your OddsYra withdrawal', body: 'We could not complete your withdrawal this time.\n\nThe amount remains in your OddsYra wallet. Please check your UPI / bank details and request again, or reply if you need help.', ctaLabel: 'Open wallet', ctaPath: '/wallet', mailboxId: 'support' },
  { id: 'upi-needed', name: 'UPI needed', group: 'more', heading: 'We need your UPI ID', subject: 'OddsYra needs a UPI ID for your payout', body: 'To pay your withdrawal we need a valid UPI ID on your account.\n\nPlease reply with the UPI ID and the name registered on it, and we will process the payout.', ctaLabel: 'Open wallet', ctaPath: '/wallet', mailboxId: 'support' },
  { id: 'bank-needed', name: 'Bank details needed', group: 'more', heading: 'We need your bank details', subject: 'OddsYra needs bank details for your payout', body: 'To complete your withdrawal we need your bank account details.\n\nPlease reply with account holder name, account number, and IFSC. They must match your KYC name.', ctaLabel: 'Open wallet', ctaPath: '/wallet', mailboxId: 'support' },
  { id: 'verify-email', name: 'Verify email', group: 'more', heading: 'Please verify your email', subject: 'Verify your OddsYra email address', body: 'Please verify your email so we can keep your OddsYra account secure.\n\nOpen your profile and request a new verification link if the last one expired.', ctaLabel: 'Open profile', ctaPath: '/profile', mailboxId: 'no-reply' },
  { id: 'account-restored', name: 'Account restored', group: 'more', heading: 'Your account is active again', subject: 'Your OddsYra account has been restored', body: 'The review on your OddsYra account is complete and access has been restored.\n\nYou can log in, place bets, and use your wallet as usual.', ctaLabel: 'Open OddsYra', ctaPath: '/sports', mailboxId: 'no-reply' },
  { id: 'bet-void', name: 'Bet voided', group: 'more', heading: 'Your bet was voided', subject: 'Update on your OddsYra bet', body: 'One of your bets was voided and the stake has been returned to your wallet.\n\nThis usually happens when the market is cancelled or the selection did not get a fair chance. Open Bets for the details.', ctaLabel: 'View bets', ctaPath: '/my-bets', mailboxId: 'support' },
  { id: 'settlement-delay', name: 'Settlement delay', group: 'more', heading: 'Your bet is still being settled', subject: 'OddsYra is settling your bet', body: 'Your bet is still being settled. Official result confirmation can take a little time after the match.\n\nWinnings, if any, will be credited automatically. No action is needed from you.', ctaLabel: 'View bets', ctaPath: '/my-bets', mailboxId: 'support' },
  { id: 'promo-code', name: 'Promo code', group: 'more', heading: 'Your promo code is ready', subject: 'Your exclusive OddsYra promo code', body: 'Here is an exclusive OddsYra promo code for you.\n\nOpen Promotions, enter the code, and follow the terms on screen. Codes are one-time and may expire.', ctaLabel: 'Apply code', ctaPath: '/promotions', mailboxId: 'promos' },
  { id: 'deposit-offer', name: 'Deposit offer', group: 'more', heading: 'A deposit offer for you', subject: 'Deposit and unlock your OddsYra offer', body: 'A deposit offer is waiting on your OddsYra account.\n\nMake a qualifying deposit and the free bet / bonus will credit after the payment is captured. Terms apply.', ctaLabel: 'View offer', ctaPath: '/promotions', mailboxId: 'promos' },
  { id: 'cashback', name: 'Cashback', group: 'more', heading: 'Your cashback is ready', subject: 'OddsYra cashback has been credited', body: 'Cashback from your recent play has been credited to your OddsYra account.\n\nOpen Rewards to see the amount and when it expires.', ctaLabel: 'View rewards', ctaPath: '/rewards', mailboxId: 'promos' },
  { id: 'daily-spin', name: 'Daily spin', group: 'more', heading: 'Your daily spin is waiting', subject: 'Spin today on OddsYra', body: 'Your OddsYra daily spin is ready.\n\nOpen Rewards, spin once, and claim a ₹100–₹750 bonus or loyalty XP from the wheel.', ctaLabel: 'Spin now', ctaPath: '/rewards', mailboxId: 'promos' },
  { id: 'cricket-offer', name: 'Cricket offer', group: 'more', heading: 'Cricket markets are live', subject: 'Cricket is live on OddsYra', body: 'Live cricket markets are up on OddsYra.\n\nOpen Sports, pick a match, and use any free bet waiting on your account. Odds move fast — bet in play while the over is live.', ctaLabel: 'Open cricket', ctaPath: '/sports', mailboxId: 'promos' },
];

function playerDisplayName(user) {
  const name = String(user?.name || user?.displayName || '').trim();
  if (name) return name;
  const firstLast = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
  if (firstLast) return firstLast;
  const email = String(user?.email || '').trim();
  return email.includes('@') ? email.split('@')[0] : '';
}

function ComposeMailPanel() {
  const { showToast } = useAdminToast();
  const [mailboxes, setMailboxes] = useState(FALLBACK_MAILBOXES);
  const [templates, setTemplates] = useState(FALLBACK_TEMPLATES);
  const [mailboxId, setMailboxId] = useState('support');
  const [templateId, setTemplateId] = useState('blank');
  const [toQuery, setToQuery] = useState('');
  const [recipients, setRecipients] = useState([]);
  const [hits, setHits] = useState([]);
  const [searching, setSearching] = useState(false);
  const [subject, setSubject] = useState('');
  const [heading, setHeading] = useState('Message from OddsYra');
  const [greetingName, setGreetingName] = useState('');
  const [body, setBody] = useState('');
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaPath, setCtaPath] = useState('');
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [confirmSend, setConfirmSend] = useState(false);

  useEffect(() => {
    let cancelled = false;
    adminApiClient.get('/communications/mailboxes')
      .then((data) => {
        if (cancelled) return;
        if (data.mailboxes?.length) setMailboxes(data.mailboxes);
        if (data.templates?.length) setTemplates(data.templates);
      })
      .catch(() => { /* keep fallbacks */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const q = toQuery.trim();
    if (q.length < 2) {
      setHits([]);
      setSearching(false);
      return undefined;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      adminApiClient.get(`/customers?q=${encodeURIComponent(q)}&limit=12`)
        .then((data) => {
          if (cancelled) return;
          setHits(data.users || data.customers || []);
        })
        .catch(() => {
          if (!cancelled) setHits([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [toQuery]);

  const selectedMailbox = useMemo(
    () => mailboxes.find((m) => m.id === mailboxId) || mailboxes[0],
    [mailboxes, mailboxId],
  );

  const coreTemplates = useMemo(
    () => templates.filter((t) => (t.group || 'core') === 'core'),
    [templates],
  );
  const opsTemplates = useMemo(
    () => templates.filter((t) => t.group === 'ops'),
    [templates],
  );
  const moreTemplates = useMemo(
    () => templates.filter((t) => t.group === 'more'),
    [templates],
  );

  const toValue = useMemo(() => {
    const emails = recipients.map((r) => r.email).filter(Boolean);
    const typed = toQuery.trim();
    if (typed.includes('@') && !emails.includes(typed.toLowerCase())) emails.push(typed);
    return emails.join(', ');
  }, [recipients, toQuery]);

  const applyTemplate = (id) => {
    const tpl = templates.find((t) => t.id === id) || FALLBACK_TEMPLATES[0];
    setTemplateId(tpl.id);
    setMailboxId(tpl.mailboxId || mailboxId);
    setSubject(tpl.subject || '');
    setHeading(tpl.heading || 'Message from OddsYra');
    setBody(tpl.body || '');
    setCtaLabel(tpl.ctaLabel || '');
    setCtaPath(tpl.ctaPath || '');
  };

  const addRecipient = (user) => {
    const email = String(user.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      showToast('That player has no email on file', 'error');
      return false;
    }
    const name = playerDisplayName(user) || email.split('@')[0];
    setRecipients((prev) => {
      if (prev.some((r) => r.email === email)) return prev;
      return [...prev, {
        id: user.id || user.userId || user.user_id,
        email,
        name,
        phone: user.phone || '',
      }].slice(0, 25);
    });
    setGreetingName(name);
    setToQuery('');
    setHits([]);
    return true;
  };

  const removeRecipient = (email) => {
    const next = recipients.filter((r) => r.email !== email);
    setRecipients(next);
    setGreetingName(next.length ? (next[next.length - 1].name || '') : '');
  };

  const addTypedEmail = () => {
    const typed = toQuery.trim().replace(/,+$/, '');
    const angled = typed.match(/^(.*?)\s*<([^>]+@[^>]+)>$/);
    const email = String(angled ? angled[2] : typed).trim().toLowerCase();
    const name = angled ? angled[1].replace(/^["']|["']$/g, '').trim() : '';
    if (!email.includes('@')) {
      if (hits[0]) return addRecipient(hits[0]);
      return false;
    }
    setRecipients((prev) => {
      if (prev.some((r) => r.email === email)) return prev;
      return [...prev, { email, name: name || email.split('@')[0], phone: '' }].slice(0, 25);
    });
    if (name) setGreetingName(name);
    setToQuery('');
    setHits([]);
    return true;
  };

  const handleSend = async (e) => {
    e.preventDefault();
    const to = toValue.trim();
    if (!to || !subject.trim() || !body.trim()) {
      showToast('To, subject, and body are required', 'error');
      return;
    }
    setConfirmSend(true);
  };

  const executeSend = async () => {
    const to = toValue.trim();
    setSending(true);
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://oddsyra.com';
      const ctaHref = ctaPath.trim()
        ? (ctaPath.trim().startsWith('http') ? ctaPath.trim() : `${origin}${ctaPath.trim().startsWith('/') ? '' : '/'}${ctaPath.trim()}`)
        : undefined;
      const res = await adminApiClient.post('/communications/compose', {
        mailboxId,
        to,
        subject: subject.trim(),
        body: body.trim(),
        heading: heading.trim() || subject.trim(),
        greetingName: greetingName.trim() || undefined,
        ctaLabel: ctaLabel.trim() || undefined,
        ctaHref,
      });
      setLastResult(res);
      setConfirmSend(false);
      if (res.failed > 0) {
        showToast(`Sent ${res.sent || 0}, failed ${res.failed}`, 'error');
      } else {
        showToast(`Sent from ${res.mailbox?.email || selectedMailbox?.email} to ${res.sent || 0} recipient(s)`, 'success');
      }
    } catch (err) {
      showToast(err.message || 'Send failed', 'error');
    } finally {
      setSending(false);
    }
  };

  const renderTemplateRow = (items) => (
    <div className="admin-compose-mail__templates" role="list">
      {items.map((tpl) => (
        <button
          key={tpl.id}
          type="button"
          role="listitem"
          className={`admin-compose-mail__tpl${templateId === tpl.id ? ' is-active' : ''}`}
          onClick={() => applyTemplate(tpl.id)}
        >
          {tpl.name}
        </button>
      ))}
    </div>
  );

  return (
    <div className="admin-compose-mail">
      <div style={{ marginBottom: 16 }}>
        <h2 className="admin-page-header__title">Compose email</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          Search a player by name, email, or mobile, then pick a shortcut to fill subject and body.
        </p>
      </div>

      {renderTemplateRow(coreTemplates)}
      {opsTemplates.length > 0 && (
        <div className="admin-compose-mail__shortcuts-label">More shortcuts</div>
      )}
      {opsTemplates.length > 0 && renderTemplateRow(opsTemplates)}
      {moreTemplates.length > 0 && (
        <div className="admin-compose-mail__shortcuts-label">Also</div>
      )}
      {moreTemplates.length > 0 && renderTemplateRow(moreTemplates)}

      <form onSubmit={handleSend} className="admin-compose-mail__form">
        <fieldset className="admin-compose-mail__from">
          <legend>Send from</legend>
          <div className="admin-compose-mail__mailboxes">
            {mailboxes.map((box) => (
              <label
                key={box.id}
                className={`admin-compose-mail__mailbox${mailboxId === box.id ? ' is-active' : ''}`}
              >
                <input
                  type="radio"
                  name="mailbox"
                  value={box.id}
                  checked={mailboxId === box.id}
                  onChange={() => setMailboxId(box.id)}
                />
                <span className="admin-compose-mail__mailbox-email">{box.email}</span>
                <span className="admin-compose-mail__mailbox-desc">{box.description || box.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="admin-compose-mail__label">
          To
          <div className="admin-compose-mail__to">
            {recipients.map((r) => (
              <span key={r.email} className="admin-compose-mail__chip">
                <span className="admin-compose-mail__chip-name">{r.name || r.email}</span>
                {r.name && r.email ? <span className="admin-compose-mail__chip-email">{r.email}</span> : null}
                <button type="button" aria-label={`Remove ${r.email}`} onClick={() => removeRecipient(r.email)}>×</button>
              </span>
            ))}
            <input
              className="admin-compose-mail__to-input"
              value={toQuery}
              onChange={(e) => setToQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  addTypedEmail();
                }
                if (e.key === 'Backspace' && !toQuery && recipients.length) {
                  removeRecipient(recipients[recipients.length - 1].email);
                }
              }}
              placeholder={recipients.length ? 'Add another…' : 'Search name, email, or mobile'}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              data-1p-ignore="true"
              data-lpignore="true"
              name="oddsyra-compose-to"
            />
            {toQuery.trim().length >= 2 && (
              <div className="admin-compose-mail__hits" role="listbox">
                {searching && hits.length === 0 && <div className="admin-compose-mail__hit-empty">Searching…</div>}
                {!searching && hits.length === 0 && (
                  <div className="admin-compose-mail__hit-empty">
                    {toQuery.includes('@') ? 'Press Enter to use this email' : 'No matching players'}
                  </div>
                )}
                {hits.map((user) => {
                  const id = user.id || user.userId || user.user_id;
                  const name = playerDisplayName(user);
                  return (
                    <button
                      key={id || user.email}
                      type="button"
                      className="admin-compose-mail__hit"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        addRecipient(user);
                      }}
                    >
                      <strong>{name || 'Player'}</strong>
                      <span>{[user.email, user.phone].filter(Boolean).join(' · ')}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <label className="admin-compose-mail__label">
          Subject
          <input
            className="admin-input"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Email subject"
            required
          />
        </label>

        <div className="admin-compose-mail__row">
          <label className="admin-compose-mail__label">
            Heading (in email)
            <input
              className="admin-input"
              value={heading}
              onChange={(e) => setHeading(e.target.value)}
              placeholder="Shown as the branded email title"
            />
          </label>
          <label className="admin-compose-mail__label">
            Greeting name
            <input
              className="admin-input"
              value={greetingName}
              onChange={(e) => setGreetingName(e.target.value)}
              placeholder={greetingName ? '' : 'Hi “selected user”,'}
            />
            {greetingName ? (
              <span className="admin-compose-mail__hint">Sends as Hi <strong>{greetingName}</strong>,</span>
            ) : null}
          </label>
        </div>

        <label className="admin-compose-mail__label">
          Body
          <textarea
            className="admin-input"
            rows={8}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Plain text — blank lines become paragraphs"
            required
          />
        </label>

        <div className="admin-compose-mail__row">
          <label className="admin-compose-mail__label">
            CTA label (optional)
            <input
              className="admin-input"
              value={ctaLabel}
              onChange={(e) => setCtaLabel(e.target.value)}
              placeholder="e.g. Open support"
            />
          </label>
          <label className="admin-compose-mail__label">
            CTA path (optional)
            <input
              className="admin-input"
              value={ctaPath}
              onChange={(e) => setCtaPath(e.target.value)}
              placeholder="/profile or full URL"
            />
          </label>
        </div>

        <div className="admin-compose-mail__actions">
          <button type="submit" className="admin-btn admin-btn--primary" disabled={sending}>
            {sending ? 'Sending…' : `Send from ${selectedMailbox?.email || 'mailbox'}`}
          </button>
        </div>

        {lastResult && (
          <p className="admin-compose-mail__result">
            Last send: {lastResult.sent ?? 0} sent · {lastResult.failed ?? 0} failed
            {lastResult.mailbox?.email ? ` · from ${lastResult.mailbox.email}` : ''}
          </p>
        )}
      </form>
      <AdminConfirmDialog
        isOpen={confirmSend}
        variant="danger"
        icon="📧"
        title="Send mail?"
        description="This delivers live email from the selected mailbox. Confirm recipients before continuing."
        details={[
          { label: 'From', value: selectedMailbox?.email || mailboxId },
          { label: 'To', value: toValue || '—' },
          { label: 'Subject', value: subject || '—' },
          { label: 'Recipients', value: String(recipients.length || (toValue ? toValue.split(',').length : 0)) },
        ]}
        confirmLabel="Send email"
        cancelLabel="Cancel"
        loading={sending}
        onCancel={() => setConfirmSend(false)}
        onConfirm={executeSend}
      />
    </div>
  );
}

function BroadcastPanel() {
  const [title, setTitle] = useState('Announcement');
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('TRANSACTIONAL');
  const [limit, setLimit] = useState('500');
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [confirmSend, setConfirmSend] = useState(false);
  const { showToast } = useAdminToast();

  const handleSend = async (e) => {
    e.preventDefault();
    if (!message.trim()) {
      showToast('Message is required', 'error');
      return;
    }
    setConfirmSend(true);
  };

  const executeSend = async () => {
    setSending(true);
    try {
      const res = await adminApiClient.post('/communications/broadcast', {
        title: title.trim() || 'Announcement',
        message: message.trim(),
        category,
        limit: Number(limit) || 500,
      });
      setLastResult(res);
      setConfirmSend(false);
      showToast(`Broadcast sent to ${res.sent ?? 0} users`, 'success');
    } catch (err) {
      showToast(err.message || 'Broadcast failed', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <h2 className="admin-page-header__title">Broadcast Notification</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          Send an in-app notification to recent users (capped by limit).
        </p>
      </div>
      <form
        onSubmit={handleSend}
        style={{
          maxWidth: 520,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          padding: 16,
          borderRadius: 12,
          border: '1px solid var(--admin-border)',
          background: 'var(--admin-surface)',
        }}
      >
        <label style={{ fontSize: '0.76rem', fontWeight: 700 }}>
          Title
          <input
            className="admin-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: 4 }}
          />
        </label>
        <label style={{ fontSize: '0.76rem', fontWeight: 700 }}>
          Message
          <textarea
            className="admin-input"
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
            style={{ display: 'block', width: '100%', marginTop: 4, resize: 'vertical' }}
          />
        </label>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <label style={{ fontSize: '0.76rem', fontWeight: 700, flex: '1 1 140px' }}>
            Category
            <select
              className="admin-input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{ display: 'block', width: '100%', marginTop: 4 }}
            >
              <option value="TRANSACTIONAL">TRANSACTIONAL</option>
              <option value="PROMOTIONAL">PROMOTIONAL</option>
            </select>
          </label>
          <label style={{ fontSize: '0.76rem', fontWeight: 700, flex: '1 1 100px' }}>
            Limit
            <input
              className="admin-input"
              type="number"
              min="1"
              max="2000"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              style={{ display: 'block', width: '100%', marginTop: 4 }}
            />
          </label>
        </div>
        <button type="submit" className="admin-btn admin-btn--primary" disabled={sending}>
          {sending ? 'Sending…' : 'Send broadcast'}
        </button>
        {lastResult && (
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--admin-text-muted)' }}>
            Last run: {lastResult.sent ?? 0} sent · {lastResult.skipped ?? 0} skipped · {lastResult.failed ?? 0} failed
            (of {lastResult.total ?? '—'})
          </p>
        )}
      </form>
      <AdminConfirmDialog
        isOpen={confirmSend}
        variant="warning"
        icon="📣"
        title="Send broadcast?"
        description="This pushes an in-app notification to up to the limit of recent users."
        details={[
          { label: 'Title', value: title || 'Announcement' },
          { label: 'Category', value: category },
          { label: 'Limit', value: String(limit || 500) },
        ]}
        confirmLabel="Send broadcast"
        cancelLabel="Cancel"
        loading={sending}
        onCancel={() => setConfirmSend(false)}
        onConfirm={executeSend}
      />
    </div>
  );
}

export default function CommunicationsDomainView({ subModule = 'dispatch-logs' }) {
  const inboxIds = ['mail-inbox', 'dispatch-logs', 'dlq-retry'];
  if (inboxIds.includes(subModule)) {
    const initial = subModule === 'mail-inbox' ? 'dispatch-logs' : subModule;
    return (
      <AdminHub
        domainId="communications"
        initialTab={initial}
        tabs={[
          { id: 'dispatch-logs', label: 'Sent' },
          { id: 'dlq-retry', label: 'Failed' },
        ]}
      >
        {(tab) => <CommunicationsPanels subModule={tab} />}
      </AdminHub>
    );
  }
  return <CommunicationsPanels subModule={subModule} />;
}

function CommunicationsPanels({ subModule = 'dispatch-logs' }) {
  const [logs, setLogs] = useState([]);
  const [outboxEvents, setOutboxEvents] = useState([]);
  const [error, setError] = useState(null);
  const { showToast } = useAdminToast();

  useEffect(() => {
    if (subModule === 'broadcast' || subModule === 'compose') return undefined;
    let cancelled = false;
    const load = async () => {
      try {
        const data = await adminApiClient.get('/communications/logs');
        if (cancelled) return;
        setLogs(data.logs || []);
        setError(data.note || null);
      } catch (err) {
        if (cancelled) return;
        setLogs([]);
        setError(err.message || 'Failed to load communication logs');
      }
      if (subModule === 'dlq-retry') {
        try {
          const outbox = await adminApiClient.get('/outbox/events');
          if (cancelled) return;
          const failed = (outbox.events || []).filter((e) =>
            ['FAILED', 'DEAD_LETTER'].includes(String(e.status || '').toUpperCase()),
          );
          setOutboxEvents(failed);
        } catch {
          if (!cancelled) setOutboxEvents([]);
        }
      } else {
        setOutboxEvents([]);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [subModule]);

  // Hooks must run unconditionally (before any early return).
  const templates = useMemo(() => {
    const map = new Map();
    logs.forEach((log) => {
      const key = log.template || 'unknown';
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          template: key,
          channel: log.channel || '—',
          provider: log.provider || '—',
          deliveries: 0,
          lastSent: log.sentAt || '—',
        });
      }
      const row = map.get(key);
      row.deliveries += 1;
      if (log.sentAt && log.sentAt > row.lastSent) row.lastSent = log.sentAt;
    });
    return Array.from(map.values());
  }, [logs]);

  const failedLogs = useMemo(
    () => logs.filter((log) => FAILED_STATUSES.has(String(log.status || '').toUpperCase())),
    [logs],
  );

  const outboxRows = useMemo(
    () => outboxEvents.map((e) => ({
      id: e.id,
      channel: 'OUTBOX',
      recipient: e.aggregateId || '—',
      template: e.eventType || '—',
      provider: e.aggregateType || 'outbox',
      status: e.status,
      sentAt: e.createdAt || '—',
      source: 'outbox',
    })),
    [outboxEvents],
  );

  if (subModule === 'compose') {
    return <ComposeMailPanel />;
  }

  if (subModule === 'broadcast') {
    return <BroadcastPanel />;
  }

  const handleRetry = (log) => {
    if (log.source === 'outbox') {
      showToast('Outbox events are retried by the outbox worker — no manual webhook retry', 'info');
      return;
    }
    adminApiClient.post(`/communications/logs/${encodeURIComponent(log.id)}/retry`)
      .then(() => {
        showToast(`Retry queued for ${log.id}`, 'success');
        setLogs((prev) => prev.map((row) => (row.id === log.id ? { ...row, status: 'QUEUED' } : row)));
      })
      .catch((err) => showToast(err.message || 'Retry failed', 'error'));
  };

  const titles = {
    'dispatch-logs': ['Notification Delivery Logs', 'Webhook / notification delivery records from the database.', 'Notification Delivery Logs', logs],
    templates: ['Message Templates', 'Distinct templates inferred from recent delivery logs.', 'Active Message Templates', templates],
    'dlq-retry': ['Dead Letter Queue Retries', 'Webhook DLQ plus outbox FAILED / DEAD_LETTER events.', 'Failed Deliveries (DLQ)', failedLogs],
  };
  const [heading, hint, tableTitle, data] = titles[subModule] || titles['dispatch-logs'];

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <h2 className="admin-page-header__title">{heading}</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          {hint}
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#fbbf24', fontSize: '0.78rem' }}>{error}</p>}
      </div>

      {subModule === 'templates' ? (
        <AdminDataTable
          title={tableTitle}
          emptyMessage="No templates found in delivery logs yet"
          data={data}
          columns={[
            { header: 'Template ID', key: 'template', render: (r) => <span className="admin-text-mono" style={{ fontWeight: 700 }}>{r.template}</span> },
            { header: 'Channel', key: 'channel', render: (r) => <span className="admin-badge admin-badge--neutral">{r.channel}</span> },
            { header: 'Provider', key: 'provider' },
            { header: 'Deliveries', key: 'deliveries', render: (r) => <span style={{ fontWeight: 700 }}>{r.deliveries}</span> },
            { header: 'Last Sent', key: 'lastSent' },
          ]}
        />
      ) : (
        <>
          <AdminDataTable
            title={tableTitle}
            emptyMessage={subModule === 'dlq-retry' ? 'No failed webhook deliveries in DLQ' : 'No notification deliveries recorded yet'}
            data={data}
            columns={[
              { header: 'Message ID', key: 'id', render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.76rem' }}>{r.id}</span> },
              { header: 'Channel', key: 'channel', render: (r) => <span className="admin-badge admin-badge--neutral">{r.channel}</span> },
              { header: 'Recipient', key: 'recipient', render: (r) => <span style={{ fontWeight: 600 }}>{r.recipient}</span> },
              { header: 'Template', key: 'template', hideOnMobile: true },
              { header: 'Provider', key: 'provider', hideOnMobile: true },
              {
                header: 'Status',
                key: 'status',
                render: (r) => <StatusBadge status={r.status} />,
              },
              { header: 'Sent At', key: 'sentAt' },
              ...(subModule === 'dlq-retry' ? [{
                header: 'Retry',
                key: 'retry',
                sortable: false,
                render: (r) => (
                  <button
                    type="button"
                    onClick={() => handleRetry(r)}
                    className="admin-btn admin-btn--primary admin-btn--sm"
                  >
                    Queue Retry
                  </button>
                ),
              }] : []),
            ]}
          />
          {subModule === 'dlq-retry' && (
            <AdminDataTable
              title="Outbox FAILED / DEAD_LETTER"
              emptyMessage="No failed outbox events"
              data={outboxRows}
              columns={[
                { header: 'Event ID', key: 'id', render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.76rem' }}>{r.id}</span> },
                { header: 'Channel', key: 'channel', render: (r) => <span className="admin-badge admin-badge--neutral">{r.channel}</span> },
                { header: 'Aggregate', key: 'recipient' },
                { header: 'Event type', key: 'template' },
                { header: 'Type', key: 'provider', hideOnMobile: true },
                {
                  header: 'Status',
                  key: 'status',
                  render: (r) => <StatusBadge status={r.status} />,
                },
                { header: 'Created', key: 'sentAt' },
              ]}
            />
          )}
        </>
      )}
    </div>
  );
}
