import { describe, it, expect } from 'vitest';
import { formatMetric } from '../../src/pages/Admin/domains/ControlTowerView.jsx';

describe('Control Tower formatMetric', () => {
  it('shows Data unavailable for null/NaN', () => {
    expect(formatMetric(null)).toBe('Data unavailable');
    expect(formatMetric(undefined)).toBe('Data unavailable');
    expect(formatMetric(Number.NaN)).toBe('Data unavailable');
  });

  it('formats numbers with optional prefix', () => {
    expect(formatMetric(1200)).toBe('1,200');
    expect(formatMetric(50, '₹')).toBe('₹50');
  });
});
