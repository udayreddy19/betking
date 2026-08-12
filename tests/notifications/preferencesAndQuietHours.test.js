import { describe, it, expect } from 'vitest';
import { isChannelAllowedForUser, isQuietHoursActive } from '../../lib/notificationPreferencesEngine.mjs';

describe('Phase 11 Notification Preferences & Quiet Hours Tests', () => {
  it('CRITICAL: mandatory categories (SECURITY, PAYMENT, KYC, FRAUD) bypass promotional opt-outs', () => {
    const prefs = { marketingEmail: false, marketingSms: false, marketingPush: false };

    // Mandatory security & payment events ALWAYS return true
    expect(isChannelAllowedForUser(prefs, 'SECURITY', 'EMAIL')).toBe(true);
    expect(isChannelAllowedForUser(prefs, 'PAYMENT', 'SMS')).toBe(true);
    expect(isChannelAllowedForUser(prefs, 'KYC', 'EMAIL')).toBe(true);
    expect(isChannelAllowedForUser(prefs, 'FRAUD', 'SMS')).toBe(true);

    // Promotional events respect opt-out preferences
    expect(isChannelAllowedForUser(prefs, 'PROMOTION', 'EMAIL')).toBe(false);
    expect(isChannelAllowedForUser(prefs, 'PROMOTION', 'SMS')).toBe(false);
  });

  it('Quiet Hours Calculation -> calculates 22:00 to 07:00 window accurately', () => {
    const nightDate = new Date('2026-08-11T23:30:00');
    expect(isQuietHoursActive(nightDate, 22, 7)).toBe(true);

    const dayDate = new Date('2026-08-11T14:30:00');
    expect(isQuietHoursActive(dayDate, 22, 7)).toBe(false);
  });
});
