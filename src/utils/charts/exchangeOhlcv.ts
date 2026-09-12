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

const COINEX_PERIODS: Record<string, string> = {
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

type CoinexKline = Record<string, unknown> | unknown[];

function coinexMarket(botPair: string): string {
  return exchangeSymbol(botPair).replaceAll('/', '').toUpperCase();
}

function coinexNumber(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) throw new Error('CoinEx returned an invalid candle value');
  return number;
}

function coinexTimestamp(value: unknown): number {
  const timestamp = coinexNumber(value);
  return timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
}

async function fetchCoinexFuturesOhlcv(
  botPair: string,
  timeframe: string,
  limit: number,
): Promise<PairHistory> {
  const period = COINEX_PERIODS[timeframe];
  if (!period) throw new Error(`CoinEx Futures does not support timeframe ${timeframe}`);

  const url = new URL('/coinex-api/v2/futures/kline', window.location.origin);
  url.search = new URLSearchParams({
    market: coinexMarket(botPair),
    period,
    limit: String(limit),
  }).toString();

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`CoinEx Futures request failed (${response.status})`);
  }

  const responseText = await response.text();
  let payload: { code?: number; message?: string; data?: CoinexKline[] };
  try {
    payload = JSON.parse(responseText) as {
      code?: number;
      message?: string;
      data?: CoinexKline[];
    };
  } catch {
    const contentType = response.headers.get('content-type') || 'unknown content type';
    throw new Error(`CoinEx Futures returned a non-JSON response (${contentType})`);
  }
  if (payload.code !== undefined && payload.code !== 0) {
    throw new Error(`CoinEx Futures: ${payload.message || 'market data request failed'}`);
  }
  if (!Array.isArray(payload.data) || payload.data.length === 0) {
    throw new Error(`CoinEx Futures market not found: ${coinexMarket(botPair)}`);
  }

  const data = payload.data.map((candle) => {
    if (Array.isArray(candle)) {
      return [
        coinexTimestamp(candle[0]),
        coinexNumber(candle[1]),
        coinexNumber(candle[2]),
        coinexNumber(candle[3]),
        coinexNumber(candle[4]),
        coinexNumber(candle[5]),
      ];
    }

    const timestamp = candle.created_at ?? candle.timestamp ?? candle.ts;
    return [
      coinexTimestamp(timestamp),
      coinexNumber(candle.open),
      coinexNumber(candle.high),
      coinexNumber(candle.low),
      coinexNumber(candle.close),
      coinexNumber(candle.volume),
    ];
  });

  data.sort((left, right) => left[0] - right[0]);
  const first = data[0]?.[0] ?? Date.now();
  const last = data[data.length - 1]?.[0] ?? first;

  return {
    strategy: '',
    pair: botPair,
    timeframe,
    timeframe_ms: TIMEFRAME_MS[timeframe] ?? 60_000,
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
  if (exchangeId.toLowerCase() === 'coinex' && futures) {
    return fetchCoinexFuturesOhlcv(botPair, timeframe, limit);
  }

  const ccxt = await loadCcxtBrowser();
  const ExchangeClass = ccxt[exchangeId.toLowerCase()];
  if (!ExchangeClass) throw new Error(`Unsupported exchange: ${exchangeId}`);

  const exchange = new ExchangeClass({
    enableRateLimit: true,
    options: {
      defaultType: futures ? 'swap' : 'spot',
      // OHLCV does not require deposit/withdraw currency metadata.
      fetchCurrencies: false,
    },
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
