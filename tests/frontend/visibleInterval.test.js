import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startVisibleInterval } from '../../src/utils/visibleInterval.js';

describe('startVisibleInterval', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.document = { visibilityState: 'visible', addEventListener: vi.fn(), removeEventListener: vi.fn() };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('skips ticks while the document is hidden', () => {
    const fn = vi.fn();
    const stop = startVisibleInterval(fn, 1000, { runImmediately: true });
    expect(fn).toHaveBeenCalledTimes(1);

    document.visibilityState = 'hidden';
    vi.advanceTimersByTime(3000);
    expect(fn).toHaveBeenCalledTimes(1);

    stop();
  });
});
