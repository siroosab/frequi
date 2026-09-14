<script setup lang="ts">
import type { PairControlSettings } from '@/types';
import type { TabsItem } from '@nuxt/ui';
import { buildExchangeFallbackChain } from '@/utils/charts/exchangeFallback';
import { isHigherTimeframe } from '@/utils/charts/exchangeOhlcv';

const botStore = useBotStore();
const settingsStore = useSettingsStore();
const chartStore = useChartConfigStore();
const lowerPanelsOpen = ref(false);
const chartPairControls = ref<PairControlSettings>();
const binanceFuturesEnabled = ref(false);
const okxFuturesEnabled = ref(false);
const isPrimaryBinance = computed(
  () => botStore.activeBot.botState.exchange?.toLowerCase() === 'binance',
);
const isPrimaryOkx = computed(
  () => botStore.activeBot.botState.exchange?.toLowerCase() === 'okx',
);

const chartTimeframe = computed(() => {
  const baseTimeframe = botStore.activeBot.timeframe || '';
  return isHigherTimeframe(chartStore.selectedTimeframe, baseTimeframe)
    ? chartStore.selectedTimeframe
    : baseTimeframe;
});

const chartPair = computed(() => {
  return botStore.activeBot.plotMultiPairs[0] || botStore.activeBot.whitelist[0] || '';
});

async function loadChartPairControls(pair: string) {
  if (!pair) return;
  try {
    chartPairControls.value = (await botStore.activeBot.getPairControl(pair)).settings;
  } catch {
    chartPairControls.value = undefined;
  }
}

function handleChartPriceClick(price: number) {
  window.dispatchEvent(new CustomEvent('chart-price-selected', { detail: price }));
}

async function tryFallbackExchangeDataLoad(
  pair: string,
  timeframe: string,
  primaryExchange: string,
  futures = true,
): Promise<boolean> {
  const exchangeOrder = buildExchangeFallbackChain(primaryExchange);
  const exchangeSequence = [...new Set(exchangeOrder.filter(Boolean))];

  for (const [index, exchangeId] of exchangeSequence.entries()) {
    const loaded = await botStore.activeBot.getExchangePairCandles(pair, timeframe, exchangeId, futures);
    if (loaded) {
      if (index > 0) {
        const fallbackLabel = exchangeId.toUpperCase();
        if (exchangeId === 'binance') {
          showAlert(`Primary exchange failed. Loading Binance as fallback.`, 'warning');
        } else if (exchangeId === 'okx') {
          showAlert(`Binance fallback failed. Loading OKX as final fallback.`, 'warning');
        }
        if (fallbackLabel === 'BINANCE') {
          binanceFuturesEnabled.value = true;
          okxFuturesEnabled.value = false;
        } else if (fallbackLabel === 'OKX') {
          okxFuturesEnabled.value = true;
          binanceFuturesEnabled.value = false;
        }
      }
      return true;
    }

    if (index === 0) {
      const primaryLabel = primaryExchange.toUpperCase() || 'Primary exchange';
      if (exchangeOrder.includes('binance') && exchangeOrder[0] !== 'binance') {
        showAlert(`Primary exchange ${primaryLabel} failed. Loading Binance as fallback.`, 'warning');
      }
      continue;
    }

    if (exchangeId === 'binance' && exchangeOrder.includes('okx')) {
      showAlert('Binance fallback failed. Loading OKX as final fallback.', 'warning');
    }
  }

  return false;
}

function refreshOHLCV(pair: string, columns: string[]) {
  if (binanceFuturesEnabled.value) {
    void botStore.activeBot.getExchangePairCandles(pair, chartTimeframe.value, 'binance', true);
    return;
  }
  if (okxFuturesEnabled.value) {
    void botStore.activeBot.getExchangePairCandles(pair, chartTimeframe.value, 'okx', true);
    return;
  }
  if (isHigherTimeframe(chartTimeframe.value, botStore.activeBot.timeframe)) {
    void tryFallbackExchangeDataLoad(pair, chartTimeframe.value, botStore.activeBot.botState.exchange ?? '', true);
    return;
  }
  botStore.activeBot.getPairCandles({
    pair: pair,
    timeframe: chartTimeframe.value,
    columns: columns,
  });
}

async function handleBinanceFuturesChange(enabled: boolean) {
  if (isPrimaryBinance.value) {
    showAlert('Binance is already the primary exchange.', 'info');
    return;
  }

  binanceFuturesEnabled.value = enabled;
  if (enabled) {
    okxFuturesEnabled.value = false;
  }
  if (!chartPair.value) return;

  if (enabled) {
    const loaded = await botStore.activeBot.getExchangePairCandles(
      chartPair.value,
      chartTimeframe.value,
      'binance',
      true,
    );
    if (loaded) {
      showAlert('Binance Futures candles loaded successfully.', 'success');
      return;
    }

    showAlert('Binance fallback failed. Loading OKX as final fallback.', 'warning');
    okxFuturesEnabled.value = true;
    binanceFuturesEnabled.value = false;
    const okxLoaded = await botStore.activeBot.getExchangePairCandles(
      chartPair.value,
      chartTimeframe.value,
      'okx',
      true,
    );
    if (okxLoaded) {
      showAlert('OKX Futures candles loaded successfully.', 'success');
    } else {
      okxFuturesEnabled.value = false;
      showAlert('Unable to load fallback OHLCV from Binance or OKX.', 'error');
    }
    return;
  }

  refreshOHLCV(chartPair.value, []);
  showAlert('Primary exchange candles restored.', 'success');
}

async function handleOkxFuturesChange(enabled: boolean) {
  if (isPrimaryOkx.value) {
    showAlert('OKX is already the primary exchange.', 'info');
    return;
  }

  okxFuturesEnabled.value = enabled;
  if (enabled) {
    binanceFuturesEnabled.value = false;
  }
  if (!chartPair.value) return;

  if (enabled) {
    const loaded = await botStore.activeBot.getExchangePairCandles(
      chartPair.value,
      chartTimeframe.value,
      'okx',
      true,
    );
    if (loaded) {
      showAlert('OKX Futures candles loaded successfully.', 'success');
      return;
    }

    showAlert('OKX fallback failed. Loading Binance as final fallback.', 'warning');
    binanceFuturesEnabled.value = true;
    okxFuturesEnabled.value = false;
    const binanceLoaded = await botStore.activeBot.getExchangePairCandles(
      chartPair.value,
      chartTimeframe.value,
      'binance',
      true,
    );
    if (binanceLoaded) {
      showAlert('Binance Futures candles loaded successfully.', 'success');
    } else {
      binanceFuturesEnabled.value = false;
      showAlert('Unable to load fallback OHLCV from OKX or Binance.', 'error');
    }
    return;
  }

  refreshOHLCV(chartPair.value, []);
  showAlert('Primary exchange candles restored.', 'success');
}

watch(chartPair, loadChartPairControls, { immediate: true });

const tradingTabItems = computed<TabsItem[]>(() => {
  const showText = settingsStore.multiPaneButtonsShowText;
  return [
    {
      slot: 'pairs',
      value: 'pairs',
      label: showText ? 'Pairs combined' : undefined,
      icon: 'i-mdi-view-list',
    },
    {
      slot: 'general',
      value: 'general',
      label: showText ? 'General' : undefined,
      icon: 'i-mdi-information',
    },
    {
      slot: 'performance',
      value: 'performance',
      label: showText ? 'Performance' : undefined,
      icon: 'i-mdi-chart-line',
    },
    {
      slot: 'balance',
      value: 'balance',
      label: showText ? 'Balance' : undefined,
      icon: 'i-mdi-bank',
    },
    {
      slot: 'time-breakdown',
      value: 'time-breakdown',
      label: showText ? 'Time Breakdown' : undefined,
      icon: 'i-mdi-folder-clock',
    },
    {
      slot: 'pairlist',
      value: 'pairlist',
      label: showText ? 'Pairlist' : undefined,
      icon: 'i-mdi-format-list-group',
    },
    {
      slot: 'pair-locks',
      value: 'pair-locks',
      label: showText ? 'Pair Locks' : undefined,
      icon: 'i-mdi-lock-alert',
    },
  ];
});
</script>

<template>
  <div class="relative flex h-full w-full min-h-0 flex-col overflow-hidden">
  <div class="trade-workspace min-h-0 flex-1">
    <section class="trade-panel multi-pane-panel">
      <DraggableContainer header="Multi Pane">
          <div class="mt-1 flex justify-center">
            <BotControls class="mt-1 mb-2" />
          </div>
          <UTabs color="neutral" :items="tradingTabItems" variant="link" default-value="pairs">
            <template #pairs>
              <PairSummary
                :pairlist="botStore.activeBot.whitelist"
                :current-locks="botStore.activeBot.activeLocks"
                :trades="botStore.activeBot.openTrades"
              />
            </template>
            <template #general>
              <BotStatus />
            </template>
            <template #performance>
              <BotPerformance />
            </template>
            <template #balance>
              <BotBalance />
            </template>
            <template #time-breakdown>
              <PeriodBreakdown />
            </template>
            <template #pairlist>
              <PairListLive />
            </template>
            <template #pair-locks>
              <PairLockList />
            </template>
          </UTabs>
      </DraggableContainer>
    </section>

    <section
      class="trade-panel pair-controls-panel"
      title="Pair controls: configure entry rules and open-trade risk. Focus a price field, then click the chart to set its value."
    >
      <div class="flex items-center justify-center border-b border-default px-2 py-2">
        <div class="text-center">
          <div class="text-xs font-semibold">Pair controls</div>
          <div class="truncate text-xs text-muted">{{ chartPair || 'Select a pair' }}</div>
        </div>
      </div>
      <PairControlPanels :pair="chartPair" />
    </section>

    <section class="trade-panel chart-panel">
      <DraggableContainer header="Chart">
          <div class="flex items-center gap-2 px-2 pt-2 pb-1">
            <span class="text-sm font-medium">Chart Timeframe</span>
            <TimeframeSelect
              v-model="chartStore.selectedTimeframe"
              :above-timeframe="botStore.activeBot.timeframe"
              include-above-timeframe
              class="min-w-32"
            />
          </div>
          <CandleChartContainer
            :available-pairs="botStore.activeBot.whitelist"
            :historic-view="!!false"
            :timeframe="chartTimeframe"
            :trades="botStore.activeBot.allTrades"
            :pair-controls="chartPairControls"
            @refresh-data="refreshOHLCV"
            @chart-price-click="handleChartPriceClick"
            @binance-futures-change="handleBinanceFuturesChange"
            @okx-futures-change="handleOkxFuturesChange"
            :binance-futures-enabled="binanceFuturesEnabled"
            :binance-futures-disabled="isPrimaryBinance"
            :okx-futures-enabled="okxFuturesEnabled"
            :okx-futures-disabled="isPrimaryOkx"
          >
          </CandleChartContainer>
      </DraggableContainer>
    </section>
  </div>
  <div class="relative z-50 shrink-0 border-t border-default bg-elevated pointer-events-auto px-3 py-1">
    <UButton
      color="neutral"
      variant="ghost"
      size="xs"
      :icon="lowerPanelsOpen ? 'mdi:chevron-down' : 'mdi:chevron-up'"
      @click.stop="lowerPanelsOpen = !lowerPanelsOpen"
    >
      {{ lowerPanelsOpen ? 'Hide trade details' : 'Show trade details' }}
    </UButton>
  </div>
  <section v-if="lowerPanelsOpen" class="trade-details-panels relative z-40 max-h-[28vh] w-full shrink-0 overflow-y-auto border-t border-default bg-elevated/95 p-2 pointer-events-auto">
    <div class="grid w-full min-w-0 grid-cols-1 gap-2 md:grid-cols-2">
      <DraggableContainer class="min-w-0 w-full" header="Open Trades">
        <TradeList class="open-trades" :trades="botStore.activeBot.openTrades" title="Open trades" :active-trades="true" empty-text="Currently no open trades." />
      </DraggableContainer>
      <DraggableContainer class="min-w-0 w-full" header="Closed Trades">
        <TradeList class="trade-history" :trades="botStore.activeBot.closedTrades" title="Trade history" :show-filter="true" empty-text="No closed trades so far." />
      </DraggableContainer>
      <DraggableContainer v-if="botStore.activeBot.detailTradeId && botStore.activeBot.tradeDetail" class="min-w-0 w-full" header="Trade Detail">
        <TradeDetail :trade="botStore.activeBot.tradeDetail" :stake-currency="botStore.activeBot.stakeCurrency" />
      </DraggableContainer>
    </div>
  </section>
  </div>
</template>

<style scoped>
.trade-workspace {
  display: grid;
  grid-template-columns: minmax(220px, 254.111px) minmax(220px, 292.228px) minmax(0, 1fr);
  gap: 4px;
  min-height: 0;
  overflow: hidden;
}

.trade-panel {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid rgb(125 211 252);
  background-color: rgb(240 249 255);
}

.trade-panel > :deep(.flex) {
  min-height: 0;
}

.trade-panel :deep(.drag-header) {
  background-color: rgb(224 242 241);
  border-color: rgb(153 246 228);
  color: rgb(19 78 74);
}

.trade-panel :deep(.border) {
  border-color: rgb(153 246 228);
}

.trade-panel :deep(.p-0) {
  background-color: transparent;
}

.multi-pane-panel,
.pair-controls-panel,
.chart-panel {
  display: flex;
  flex-direction: column;
}

.multi-pane-panel :deep(.p-0),
.chart-panel :deep(.p-0) {
  min-height: 0;
  overflow-y: auto;
}

.pair-controls-panel {
  overflow-y: auto;
}

.pair-controls-panel :deep(.pair-controls-content) {
  grid-template-columns: minmax(0, 1fr) !important;
}

.pair-controls-panel :deep(.pair-controls-content > *) {
  min-width: 0;
}

.pair-controls-panel :deep(.pair-controls-content) {
  gap: 0.375rem;
}

.pair-controls-panel :deep(.pair-control-card) {
  font-size: 0.8125rem;
}

.pair-controls-panel :deep(.pair-control-card input),
.pair-controls-panel :deep(.pair-control-card button),
.pair-controls-panel :deep(.pair-control-card [role='button']) {
  min-height: 1.75rem;
  padding-top: 0.25rem;
  padding-bottom: 0.25rem;
  font-size: 0.75rem;
}

.pair-controls-panel :deep(.pair-control-card .gap-3) {
  gap: 0.5rem;
}

.pair-controls-panel :deep(.pair-control-card .gap-2) {
  gap: 0.375rem;
}

.pair-controls-panel :deep(.pair-control-card) {
  flex: 0 0 auto;
  border-radius: 0.375rem;
  border-color: rgb(153 246 228);
  background-color: rgb(248 250 252);
  box-shadow: 0 1px 2px rgb(15 23 42 / 0.08);
}

.pair-controls-panel :deep(.pair-control-card-header) {
  background-color: rgb(224 242 241);
  border-color: rgb(153 246 228);
  color: rgb(19 78 74);
}

.dark {
  .trade-panel {
    border-color: rgb(56 189 248);
    background-color: rgb(8 47 73);
  }

  .trade-panel :deep(.drag-header),
  .trade-details-panels :deep(.drag-header) {
    background-color: rgb(19 78 74);
    border-color: rgb(45 212 191);
    color: rgb(204 251 241);
  }

  .trade-panel :deep(.border),
  .trade-details-panels :deep(.border) {
    border-color: rgb(45 212 191);
  }

  .trade-panel :deep(.p-0),
  .trade-details-panels :deep(.p-0) {
    background-color: transparent;
  }

  .pair-controls-panel {
    border-color: rgb(56 189 248);
    background-color: rgb(8 47 73);
  }

  .pair-controls-panel :deep(.pair-control-card) {
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.25);
    border-color: rgb(45 212 191 / 0.45);
    background-color: rgb(15 23 42 / 0.72);
  }

  .pair-controls-panel :deep(.pair-control-card-header) {
    background-color: rgb(19 78 74 / 0.55);
    border-color: rgb(45 212 191 / 0.45);
    color: rgb(204 251 241);
  }
}

@media (max-width: 1100px) {
  .trade-workspace {
    grid-template-columns: minmax(210px, 292.228px) minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
  }

  .multi-pane-panel {
    grid-row: 1;
    grid-column: 1;
  }

  .pair-controls-panel {
    grid-row: 2;
    grid-column: 1;
  }

  .chart-panel {
    grid-row: 1 / span 2;
    grid-column: 2;
  }
}

@media (max-width: 767px) {
  .trade-workspace {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }

  .trade-panel {
    flex: 0 0 420px;
  }

  .chart-panel {
    flex-basis: min(70vh, 640px);
  }
}
</style>
