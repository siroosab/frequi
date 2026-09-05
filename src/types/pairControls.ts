export interface PairControlSettings {
  pre_trade: {
    long_enabled: boolean;
    short_enabled: boolean;
    long_price_min: number | null;
    long_price_max: number | null;
    short_price_min: number | null;
    short_price_max: number | null;
    entry_size_mode: 'percent' | 'usdt';
    entry_size_value: number;
    leverage: number;
    entry_signal: 'rsi' | 'ema' | 'breakout' | 'all';
    entry_strictness: number;
    entry_tag: string;
  };
  risk: {
    stoploss_enabled: boolean;
    stoploss_mode: 'price' | 'percent';
    stoploss_price: number | null;
    stoploss_percent: number | null;
    averaging_enabled: boolean;
    averaging_trigger_mode: 'percent' | 'usdt';
    averaging_trigger_value: number | null;
    averaging_size_mode: 'percent' | 'usdt';
    averaging_size_value: number | null;
    take_profit_enabled: boolean;
    take_profit_percent: number | null;
    inactivity_exit_enabled: boolean;
    inactivity_minutes: number | null;
    inactivity_loss_percent: number | null;
    trailing_stop_enabled: boolean;
    trailing_stop_percent: number | null;
    liquidation_buffer_percent: number | null;
  };
}

export interface PairControlResponse {
  version: number;
  pair: string;
  settings: PairControlSettings;
}

export type PairControlUpdate = Partial<{
  pre_trade: Partial<PairControlSettings['pre_trade']>;
  risk: Partial<PairControlSettings['risk']>;
}>;
