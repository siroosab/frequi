import { describe, expect, it } from 'vitest';

function resolveDefaultChartPair(plotMultiPairs: string[], selectedPair: string, whitelist: string[], openTrades: { pair: string }[]) {
  return (
    plotMultiPairs[0] ||
    selectedPair ||
    whitelist[0] ||
    openTrades[0]?.pair ||
    ''
  );
}

describe('resolveDefaultChartPair', () => {
  it('prefers the active pair when present', () => {
    expect(resolveDefaultChartPair(['BTC/USDT'], '', ['ETH/USDT'], [{ pair: 'SOL/USDT' }])).toBe('BTC/USDT');
  });

  it('falls back to selectedPair when plotMultiPairs is empty', () => {
    expect(resolveDefaultChartPair([], 'ETH/USDT', ['BTC/USDT'], [{ pair: 'SOL/USDT' }])).toBe('ETH/USDT');
  });

  it('falls back to open trade pair when whitelist is empty', () => {
    expect(resolveDefaultChartPair([], '', [], [{ pair: 'SOL/USDT' }])).toBe('SOL/USDT');
  });
});
