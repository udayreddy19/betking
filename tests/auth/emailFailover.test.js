import { describe, it, expect } from 'vitest';
import {
  isQuotaOrRateLimitError,
  isEmailFailoverMonitored,
  getEmailDeliveryMetrics,
} from '../../server/auth/emailService.js';

describe('SMTP quota failover detection', () => {
  it('treats 429 and daily-limit messages as quota', () => {
    expect(isQuotaOrRateLimitError({ responseCode: 429, message: 'Too many requests' })).toBe(true);
    expect(isQuotaOrRateLimitError({ message: 'Daily limit exceeded' })).toBe(true);
    expect(isQuotaOrRateLimitError({ response: 'quota reached for this account' })).toBe(true);
    expect(isQuotaOrRateLimitError({ responseCode: 421, message: 'try again later' })).toBe(true);
  });

  it('does not treat a normal recipient bounce as quota', () => {
    expect(isQuotaOrRateLimitError({ responseCode: 550, message: 'User unknown' })).toBe(false);
    expect(isQuotaOrRateLimitError({ message: 'Invalid login' })).toBe(false);
  });

  it('treats email failover as unmonitored until Brevo SMTP fallback is configured', () => {
    expect(isEmailFailoverMonitored()).toBe(false);
    expect(getEmailDeliveryMetrics().monitored).toBe(false);
  });
});
