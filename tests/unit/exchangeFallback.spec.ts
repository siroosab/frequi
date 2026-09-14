import { describe, expect, it } from 'vitest';
import { buildExchangeFallbackChain } from '@/utils/charts/exchangeFallback';

describe('buildExchangeFallbackChain', () => {
  it('prioritizes Binance then OKX for a primary Binance failure', () => {
    expect(buildExchangeFallbackChain('binance')).toEqual(['binance', 'okx']);
  });

  it('prioritizes Binance then OKX for a primary OKX failure', () => {
    expect(buildExchangeFallbackChain('okx')).toEqual(['okx', 'binance']);
  });

  it('keeps the fallback order unique and stable for unknown exchanges', () => {
    expect(buildExchangeFallbackChain('kucoin')).toEqual(['kucoin', 'binance', 'okx']);
  });
});
