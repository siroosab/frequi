import type { PairHistory } from '@/types';

type CcxtMarket = {
  symbol: string;
  base?: string;
  quote?: string;
  settle?: string;
  swap?: boolean;
  future?: boolean;
};

type CcxtExchange = {
  markets: Record<string, CcxtMarket>;
  loadMarkets: () => Promise<Record<string, CcxtMarket>>;
  fetchOHLCV: (
    symbol: string,
    timeframe: string,
    since?: undefined,
    limit?: number,
  ) => Promise<Array<[number, number, number, number, number, number]>>;
  close: () => Promise<void>;
};

type CcxtBrowser = {
  [exchangeId: string]: new (options?: object) => CcxtExchange;
};

declare global {
  interface Window {
    ccxt?: CcxtBrowser;
  }
}

let ccxtLoad: Promise<CcxtBrowser> | undefined;

function loadCcxtBrowser(): Promise<CcxtBrowser> {
  if (window.ccxt) return Promise.resolve(window.ccxt);
  if (ccxtLoad) return ccxtLoad;

  ccxtLoad = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/ccxt@4.5.22/dist/ccxt.browser.min.js';
    script.async = true;
    script.onload = () => (window.ccxt ? resolve(window.ccxt) : reject(new Error('CCXT failed to load')));
    script.onerror = () => reject(new Error('Unable to load CCXT browser bundle'));
    document.head.appendChild(script);
  });
  return ccxtLoad;
}

const TIMEFRAME_MS: Record<string, number> = {
  '1m': 60_000,
  '3m': 180_000,
  '5m': 300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1h': 3_600_000,
  '2h': 7_200_000,
  '4h': 14_400_000,
  '6h': 21_600_000,
  '8h': 28_800_000,
  '12h': 43_200_000,
  '1d': 86_400_000,
  '3d': 259_200_000,
  '1w': 604_800_000,
  '1M': 2_592_000_000,
};

export function isHigherTimeframe(selected: string, base: string): boolean {
  const selectedMs = TIMEFRAME_MS[selected];
  const baseMs = TIMEFRAME_MS[base];
  return selectedMs !== undefined && baseMs !== undefined && selectedMs > baseMs;
}

function exchangeSymbol(botPair: string): string {
  return botPair.split(':', 1)[0] ?? botPair;
}

function findMarket(markets: Record<string, CcxtMarket>, botPair: string, futures: boolean) {
  const symbol = exchangeSymbol(botPair);
  return Object.values(markets).find((market) => {
    if (market.base && market.quote && `${market.base}/${market.quote}` !== symbol) return false;
    if (!futures) return !market.swap && !market.future;
    return market.swap === true || market.future === true;
  });
}

const COINEX_PERIOD_MAP: Record<string, string> = {
  '1m': '1min',
  '3m': '3min',
  '5m': '5min',
  '15m': '15min',
  '30m': '30min',
  '1h': '1hour',
  '2h': '2hour',
  '4h': '4hour',
  '6h': '6hour',
  '12h': '12hour',
  '1d': '1day',
  '3d': '3day',
  '1w': '1week',
};

function coinexMarketSymbol(botPair: string): string {
  return exchangeSymbol(botPair).replace('/', '').toUpperCase();
}

function normalizeCoinexCandleRow(entry: unknown): [number, number, number, number, number, number] | null {
  if (!entry || typeof entry !== 'object') return null;

  const row = entry as Record<string, unknown>;
  const timestamp = Number(row.created_at ?? row.time ?? row.ts ?? row.timestamp);
  const open = Number(row.open ?? row.o);
  const high = Number(row.high ?? row.h);
  const low = Number(row.low ?? row.l);
  const close = Number(row.close ?? row.c);
  const volume = Number(row.volume ?? row.v ?? 0);

  if (![timestamp, open, high, low, close, volume].every((value) => Number.isFinite(value))) {
    return null;
  }

  return [timestamp, open, high, low, close, volume];
}

async function fetchCoinexFuturesOhlcv(
  botPair: string,
  timeframe: string,
  limit: number,
): Promise<PairHistory> {
  const period = COINEX_PERIOD_MAP[timeframe];
  if (!period) {
    throw new Error(`Unsupported CoinEx timeframe: ${timeframe}. Supported: ${Object.keys(COINEX_PERIOD_MAP).join(', ')}`);
  }

  const market = coinexMarketSymbol(botPair);
  const baseUrl = typeof window !== 'undefined' ? new URL('/coinex-api/v2/futures/kline', window.location.origin) : new URL('http://localhost:3000/coinex-api/v2/futures/kline');
  baseUrl.searchParams.set('market', market);
  baseUrl.searchParams.set('period', period);
  baseUrl.searchParams.set('limit', String(Math.min(limit, 1000)));

  const response = await fetch(baseUrl.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`CoinEx futures OHLCV fetch failed: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
  if (!rows.length) {
    throw new Error('CoinEx futures OHLCV response did not contain expected data array');
  }

  const data = rows
    .map((row) => normalizeCoinexCandleRow(row))
    .filter((row): row is [number, number, number, number, number, number] => row !== null);

  if (!data.length) {
    throw new Error(`No CoinEx futures OHLCV data returned for ${market} (${period})`);
  }

  const first = data[0]?.[0] ?? Date.now();
  const last = data[data.length - 1]?.[0] ?? first;
  const timeframeMs = TIMEFRAME_MS[timeframe] ?? 60_000;

  return {
    strategy: '',
    pair: botPair,
    timeframe,
    timeframe_ms: timeframeMs,
    columns: ['__date_ts', 'open', 'high', 'low', 'close', 'volume'],
    data,
    annotations: [],
    length: data.length,
    buy_signals: 0,
    sell_signals: 0,
    last_analyzed: last,
    data_start_ts: first,
    data_start: new Date(first).toISOString(),
    data_stop: new Date(last).toISOString(),
    data_stop_ts: last,
  };
}

export async function fetchExchangeOhlcv(
  exchangeId: string,
  botPair: string,
  timeframe: string,
  futures: boolean,
  limit = 250,
): Promise<PairHistory> {
  const normalizedExchangeId = exchangeId.toLowerCase();

  if (normalizedExchangeId === 'coinex') {
    return fetchCoinexFuturesOhlcv(botPair, timeframe, limit);
  }

  const ccxt = await loadCcxtBrowser();
  const ExchangeClass = ccxt[normalizedExchangeId];
  if (!ExchangeClass) throw new Error(`Unsupported exchange: ${exchangeId}`);

  const exchange = new ExchangeClass({
    enableRateLimit: true,
    options: { defaultType: futures ? 'swap' : 'spot' },
  });
  try {
    const markets = await exchange.loadMarkets();
    const market = findMarket(markets, botPair, futures);
    if (!market) throw new Error(`Market not found: ${exchangeSymbol(botPair)}`);

    const candles = await exchange.fetchOHLCV(market.symbol, timeframe, undefined, limit);
    const data = candles.map(([timestamp, open, high, low, close, volume]) => [
      timestamp,
      open,
      high,
      low,
      close,
      volume,
    ]);
    const first = data[0]?.[0] ?? Date.now();
    const last = data[data.length - 1]?.[0] ?? first;
    const timeframeMs = TIMEFRAME_MS[timeframe] ?? 60_000;

    return {
      strategy: '',
      pair: botPair,
      timeframe,
      timeframe_ms: timeframeMs,
      columns: ['__date_ts', 'open', 'high', 'low', 'close', 'volume'],
      data,
      annotations: [],
      length: data.length,
      buy_signals: 0,
      sell_signals: 0,
      last_analyzed: last,
      data_start_ts: first,
      data_start: new Date(first).toISOString(),
      data_stop: new Date(last).toISOString(),
      data_stop_ts: last,
    };
  } finally {
    await exchange.close();
  }
}
