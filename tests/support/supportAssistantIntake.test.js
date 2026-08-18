import { describe, it, expect } from 'vitest';
import {
  classifyIntent,
  createEmptyIntake,
  extractIssueFacts,
  nextSupportTurn,
  buildTicketPayload,
} from '../../lib/supportAssistant.mjs';

describe('support assistant intake', () => {
  it('does not invent personal account or KYC status', () => {
    const turn = nextSupportTurn({ query: 'what is my kyc status?', intake: createEmptyIntake() });
    expect(turn.response).not.toMatch(/VERIFIED|UNDER REVIEW|Priya Sharma/i);
    expect(turn.intake.category).toBe('KYC');
  });

  it('classifies a withdrawal and asks follow-up questions', () => {
    let intake = createEmptyIntake();
    let turn = nextSupportTurn({ query: 'My UPI withdrawal of ₹1000 is still pending', intake });
    expect(turn.intake.category).toBe('Withdrawal');
    expect(turn.intake.amount).toBe('1000');
    expect(turn.intake.method.toLowerCase()).toContain('upi');
    expect(turn.response).toMatch(/transaction ID|UTR|skip/i);

    intake = turn.intake;
    turn = nextSupportTurn({ query: 'skip', intake, loggedIn: true });
    expect(turn.intake.readyForTicket).toBe(true);
    expect(turn.response).toMatch(/create a support ticket/i);
    expect(turn.actions.some((a) => a.actionType === 'ESCALATE')).toBe(true);
  });

  it('creates ticket payload from chat transcript', () => {
    const intake = {
      ...createEmptyIntake(),
      category: 'Withdrawal',
      summary: 'UPI withdrawal pending',
      details: 'Money not received after 2 hours',
      amount: '1000',
      method: 'UPI',
      reference: 'UTR123',
    };
    const payload = buildTicketPayload(intake, [
      { sender: 'user', text: 'My withdrawal is pending' },
      { sender: 'agent', text: 'What amount?' },
    ]);
    expect(payload.category).toBe('Withdrawal');
    expect(payload.subject).toMatch(/UPI withdrawal/i);
    expect(payload.initialMessage).toMatch(/Amount: ₹1000/);
    expect(payload.initialMessage).toMatch(/User: My withdrawal is pending/);
  });

  it('asks the user to log in before opening a ticket', () => {
    const first = nextSupportTurn({
      query: 'deposit of ₹500 via PhonePe failed today',
      intake: createEmptyIntake(),
      loggedIn: false,
    });
    const confirm = nextSupportTurn({ query: 'skip', intake: first.intake, loggedIn: false });
    expect(confirm.shouldCreateTicket).toBe(false);
    expect(confirm.actions.some((a) => a.actionType === 'LOGIN')).toBe(true);
  });

  it('treats yes as a ticket confirmation when logged in', () => {
    let turn = nextSupportTurn({
      query: 'I cannot log in and OTP never arrives',
      intake: createEmptyIntake(),
      loggedIn: true,
    });
    turn = nextSupportTurn({ query: 'skip', intake: turn.intake, loggedIn: true });
    turn = nextSupportTurn({ query: 'yes', intake: turn.intake, loggedIn: true });
    expect(turn.shouldCreateTicket).toBe(true);
    expect(turn.intake.readyForTicket).toBe(true);
  });

  it('extracts amount only from currency-like phrases', () => {
    expect(extractIssueFacts('waited 15 minutes').amount).toBe('');
    expect(extractIssueFacts('₹2,500 via UPI').amount).toBe('2500');
    expect(classifyIntent('hello there')).toBe('GREETING');
  });
});
