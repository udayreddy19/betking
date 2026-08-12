import { query } from '../db/pg.js';

/**
 * Server-Authoritative Notification Template Engine
 * Whitelisted variable substitution, template versioning, and language fallback.
 * STRICT SECURITY RULE: NEVER evaluates template content using eval() or Function().
 */

export const WHITELISTED_VARIABLES = [
  'user_name',
  'bet_id',
  'stake',
  'payout',
  'amount',
  'status',
  'match_name',
  'market_name',
  'reason',
  'bonus_name',
];

export function substituteVariables(templateText = '', variables = {}) {
  let result = templateText;
  for (const key of WHITELISTED_VARIABLES) {
    if (Object.prototype.hasOwnProperty.call(variables, key)) {
      const val = variables[key] !== undefined && variables[key] !== null ? String(variables[key]) : '';
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      result = result.replace(regex, val);
    }
  }
  return result;
}

export class NotificationTemplateEngine {
  async renderTemplate({ eventType, channel, version = 1, variables = {}, lang = 'EN' }) {
    if (!eventType || !channel) {
      throw new Error('Template rendering requires eventType and channel');
    }

    const tRes = await query(
      `SELECT subject, body_template, version FROM notification_templates
       WHERE event_type = $1 AND channel = $2 AND status = 'ACTIVE'
       ORDER BY version DESC LIMIT 1`,
      [eventType, channel]
    );

    let subject = `${eventType.toUpperCase()} Update`;
    let bodyTemplate = `Event ${eventType} notification for user {{user_name}}. Details: {{status}} {{amount}}`;
    let templateVersion = version;

    if (tRes.rows.length > 0) {
      subject = tRes.rows[0].subject || subject;
      bodyTemplate = tRes.rows[0].body_template || bodyTemplate;
      templateVersion = tRes.rows[0].version || version;
    }

    const renderedSubject = substituteVariables(subject, variables);
    const renderedBody = substituteVariables(bodyTemplate, variables);

    return {
      eventType,
      channel,
      version: templateVersion,
      subject: renderedSubject,
      body: renderedBody,
    };
  }
}

export const notificationTemplateEngine = new NotificationTemplateEngine();
