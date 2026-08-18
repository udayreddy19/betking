import { describe, it, expect } from 'vitest';
import { asDisplayText, teamDisplayName } from '../../src/utils/teamShortName.js';

describe('asDisplayText', () => {
  it('returns strings and numbers', () => {
    expect(asDisplayText('IPL')).toBe('IPL');
    expect(asDisplayText(12)).toBe('12');
  });

  it('does not pass objects through as React children', () => {
    expect(asDisplayText({ name: 'Indian Premier League' })).toBe('Indian Premier League');
    expect(asDisplayText({ foo: 1 }, 'Scheduled')).toBe('Scheduled');
    expect(asDisplayText(null, 'TBD')).toBe('TBD');
  });
});

describe('teamDisplayName', () => {
  it('reads nested name fields', () => {
    expect(teamDisplayName({ name: 'Mumbai Indians' })).toBe('Mumbai Indians');
    expect(teamDisplayName({ name: { label: 'CSK' } })).toBe('CSK');
  });
});
