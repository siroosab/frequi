<script setup lang="ts">
import type { GridItemData, PairControlSettings } from '@/types';
import type { TabsItem } from '@nuxt/ui';
import { isHigherTimeframe } from '@/utils/charts/exchangeOhlcv';

const botStore = useBotStore();
const layoutStore = useLayoutStore();
const settingsStore = useSettingsStore();
const chartStore = useChartConfigStore();
const currentBreakpoint = ref('');
const pairControlsOpen = ref(false);
const lowerPanelsOpen = ref(false);
const chartPairControls = ref<PairControlSettings>();

const breakpointChanged = (newBreakpoint: string) => {
  // console.log('breakpoint:', newBreakpoint);
  currentBreakpoint.value = newBreakpoint;
};
const isResizableLayout = computed(() =>
  ['', 'sm', 'md', 'lg', 'xl'].includes(currentBreakpoint.value),
);
const isLayoutLocked = computed(() => {
  return layoutStore.layoutLocked || !isResizableLayout.value;
});
const gridLayoutData = computed((): GridItemData[] => {
  if (isResizableLayout.value) {
    return layoutStore.tradingLayout;
  }
  return [...layoutStore.getTradingLayoutSm];
});

const gridLayoutMultiPane = computed(() => {
  return findGridLayout(gridLayoutData.value, TradeLayout.multiPane);
});

const gridLayoutOpenTrades = computed(() => {
  return findGridLayout(gridLayoutData.value, TradeLayout.openTrades);
});

const gridLayoutTradeHistory = computed(() => {
  return findGridLayout(gridLayoutData.value, TradeLayout.tradeHistory);
});

const gridLayoutTradeDetail = computed(() => {
  return findGridLayout(gridLayoutData.value, TradeLayout.tradeDetail);
});

const gridLayoutChartView = computed(() => {
  return findGridLayout(gridLayoutData.value, TradeLayout.chartView);
});

const responsiveGridLayouts = computed(() => {
  return {
    sm: layoutStore.getTradingLayoutSm,
  };
});

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

function refreshOHLCV(pair: string, columns: string[]) {
  if (isHigherTimeframe(chartTimeframe.value, botStore.activeBot.timeframe)) {
    botStore.activeBot.getExchangePairCandles(pair, chartTimeframe.value);
    return;
  }
  botStore.activeBot.getPairCandles({
    pair: pair,
    timeframe: chartTimeframe.value,
    columns: columns,
  });
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
  <div class="flex h-full w-full min-h-0 flex-col overflow-hidden">
  <GridLayout
    class="relative z-0 min-h-0 w-full flex-1 overflow-hidden"
    style="padding: 1px"
    :row-height="50"
    :layout="gridLayoutData"
    :vertical-compact="false"
    :margin="[1, 1]"
    :responsive-layouts="responsiveGridLayouts"
    :is-resizable="!isLayoutLocked"
    :is-draggable="!isLayoutLocked"
    :responsive="true"
    :cols="{ lg: 12, md: 12, sm: 12, xs: 12, xxs: 12 }"
    :col-num="12"
    @update:breakpoint="breakpointChanged"
  >
    <template #default="{ gridItemProps }">
      <GridItem
        v-if="gridLayoutMultiPane.h !== 0"
        v-bind="gridItemProps"
        class="multi-pane-grid-item"
        :i="gridLayoutMultiPane.i"
        :x="gridLayoutMultiPane.x"
        :y="gridLayoutMultiPane.y"
        :w="gridLayoutMultiPane.w"
        :h="gridLayoutMultiPane.h"
        drag-allow-from=".drag-header"
      >
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
      </GridItem>
      <GridItem
        v-if="false"
        v-bind="gridItemProps"
        :i="gridLayoutOpenTrades.i"
        :x="gridLayoutOpenTrades.x"
        :y="gridLayoutOpenTrades.y"
        :w="gridLayoutOpenTrades.w"
        :h="gridLayoutOpenTrades.h"
        drag-allow-from=".drag-header"
      >
        <DraggableContainer header="Open Trades">
          <TradeList
            class="open-trades"
            :trades="botStore.activeBot.openTrades"
            title="Open trades"
            :active-trades="true"
            empty-text="Currently no open trades."
          />
        </DraggableContainer>
      </GridItem>
      <GridItem
        v-if="false"
        v-bind="gridItemProps"
        :i="gridLayoutTradeHistory.i"
        :x="gridLayoutTradeHistory.x"
        :y="gridLayoutTradeHistory.y"
        :w="gridLayoutTradeHistory.w"
        :h="gridLayoutTradeHistory.h"
        drag-allow-from=".drag-header"
      >
        <DraggableContainer header="Closed Trades">
          <TradeList
            class="trade-history"
            :trades="botStore.activeBot.closedTrades"
            title="Trade history"
            :show-filter="true"
            empty-text="No closed trades so far."
          />
        </DraggableContainer>
      </GridItem>
      <GridItem
        v-if="
          false &&
          botStore.activeBot.detailTradeId &&
          botStore.activeBot.tradeDetail &&
          gridLayoutTradeDetail.h !== 0
        "
        v-bind="gridItemProps"
        :i="gridLayoutTradeDetail.i"
        :x="gridLayoutTradeDetail.x"
        :y="gridLayoutTradeDetail.y"
        :w="gridLayoutTradeDetail.w"
        :h="gridLayoutTradeDetail.h"
        :min-h="4"
        drag-allow-from=".drag-header"
      >
        <DraggableContainer header="Trade Detail">
          <TradeDetail
            :trade="botStore.activeBot.tradeDetail!"
            :stake-currency="botStore.activeBot.stakeCurrency"
          />
        </DraggableContainer>
      </GridItem>
      <GridItem
        v-if="gridLayoutChartView.h !== 0"
        v-bind="gridItemProps"
        :i="gridLayoutChartView.i"
        :x="gridLayoutChartView.x"
        :y="gridLayoutChartView.y"
        :w="gridLayoutChartView.w"
        :h="gridLayoutChartView.h"
        :min-h="6"
        drag-allow-from=".drag-header"
      >
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
          >
          </CandleChartContainer>
        </DraggableContainer>
      </GridItem>
    </template>
  </GridLayout>
  <section class="relative z-50 shrink-0 border-t border-default bg-elevated/95 pointer-events-auto">
    <div class="flex items-center justify-between px-3 py-1">
      <UButton
        color="neutral"
        variant="ghost"
        size="sm"
        class="w-full justify-center bg-neutral-200 px-0 text-center hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600"
        :icon="pairControlsOpen ? 'mdi:chevron-down' : 'mdi:chevron-up'"
        :aria-label="pairControlsOpen ? 'Collapse pair controls' : 'Expand pair controls'"
        @click.stop="pairControlsOpen = !pairControlsOpen"
      >
        <span class="flex items-center gap-2">
          <span class="text-xs font-semibold">Pair controls</span>
          <span class="truncate text-xs text-muted">{{ chartPair || 'Select a pair' }}</span>
        </span>
      </UButton>
    </div>
    <div v-show="pairControlsOpen" class="max-h-[22vh] overflow-y-auto border-t border-default">
      <PairControlPanels :pair="chartPair" />
    </div>
  </section>
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
  <section v-if="lowerPanelsOpen" class="relative z-40 max-h-[28vh] w-full shrink-0 overflow-y-auto border-t border-default bg-elevated/95 p-2 pointer-events-auto">
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
.multi-pane-grid-item {
  width: 280px !important;
}
</style>
