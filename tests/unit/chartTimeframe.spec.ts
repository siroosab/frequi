import { describe, expect, it } from 'vitest';
import { resolveDisplayTimeframe } from '@/utils/charts/chartTimeframe';

describe('resolveDisplayTimeframe', () => {
  it('prefers the selected higher timeframe over the base bot timeframe', () => {
    expect(resolveDisplayTimeframe('4h', '15m')).toBe('4h');
    expect(resolveDisplayTimeframe('1d', '1h')).toBe('1d');
  });

  it('falls back to the bot timeframe when no higher timeframe is selected', () => {
    expect(resolveDisplayTimeframe('', '15m')).toBe('15m');
    expect(resolveDisplayTimeframe(undefined, '1h')).toBe('1h');
  });
});
