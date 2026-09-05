<script setup lang="ts">
import axios from 'axios';
import type { PairControlSettings } from '@/types';

const props = defineProps<{ pair: string }>();
const botStore = useBotStore();
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const settings = ref<PairControlSettings | null>(null);
const activePriceDirection = ref<'long' | 'short'>('long');

async function load() {
  if (!props.pair) return;
  loading.value = true;
  error.value = '';
  try {
    const response = await botStore.activeBot.getPairControl(props.pair);
    settings.value = structuredClone(response.settings);
  } catch (err) {
    error.value = axios.isAxiosError(err) && err.response?.status === 404
      ? 'Pair controls are not available on this bot yet. Deploy the custom backend first.'
      : err instanceof Error ? err.message : 'Unable to load pair controls';
  } finally {
    loading.value = false;
  }
}

function handleLiveUpdate(event: Event) {
  const detail = (event as CustomEvent<{ pair: string; settings: PairControlSettings }>).detail;
  if (detail.pair === props.pair) settings.value = structuredClone(detail.settings);
}

function handleChartPrice(event: Event) {
  if (!settings.value) return;
  const price = (event as CustomEvent<number>).detail;
  if (typeof price !== 'number') return;
  if (activePriceDirection.value === 'long') settings.value.pre_trade.long_price_min = price;
  else settings.value.pre_trade.short_price_min = price;
}

function requestPrice(direction: 'long' | 'short') {
  activePriceDirection.value = direction;
}

async function save() {
  if (!settings.value || !props.pair) return;
  saving.value = true;
  error.value = '';
  try {
    const response = await botStore.activeBot.updatePairControl(props.pair, settings.value);
    settings.value = structuredClone(response.settings);
  } catch (err) {
    error.value = axios.isAxiosError(err) && err.response?.status === 404
      ? 'Pair controls are not available on this bot yet. Deploy the custom backend first.'
      : err instanceof Error ? err.message : 'Unable to save pair controls';
  } finally {
    saving.value = false;
  }
}

watch(() => props.pair, load, { immediate: true });
onMounted(() => {
  window.addEventListener('pair-control-updated', handleLiveUpdate);
  window.addEventListener('chart-price-selected', handleChartPrice);
});
onUnmounted(() => {
  window.removeEventListener('pair-control-updated', handleLiveUpdate);
  window.removeEventListener('chart-price-selected', handleChartPrice);
});
</script>

<template>
  <div v-if="pair" class="grid gap-3 xl:grid-cols-2 p-2">
    <UCard :ui="{ body: 'p-3 sm:p-4' }">
      <template #header><div class="flex items-center justify-between"><div><p class="text-xs uppercase tracking-wide text-muted">Pre-trade</p><h3 class="text-lg font-semibold">{{ pair }}</h3></div><UBadge color="primary" variant="subtle">Futures</UBadge></div></template>
      <div v-if="loading" class="text-sm text-muted">Loading controls...</div>
      <div v-else-if="settings" class="grid gap-3">
        <div class="grid grid-cols-2 gap-2"><UFormField label="Allow Long"><USwitch v-model="settings.pre_trade.long_enabled" /></UFormField><UFormField label="Allow Short"><USwitch v-model="settings.pre_trade.short_enabled" /></UFormField></div>
        <UAlert v-if="!settings.pre_trade.long_enabled && !settings.pre_trade.short_enabled" color="warning" title="Trading disabled for this pair" description="Enable Long or Short before allowing a new entry." />
        <div class="grid grid-cols-2 gap-2"><UFormField label="Long price min"><UInputNumber v-model="settings.pre_trade.long_price_min" :min="0" /></UFormField><UFormField label="Long price max"><UInputNumber v-model="settings.pre_trade.long_price_max" :min="0" /></UFormField><UFormField label="Short price min"><UInputNumber v-model="settings.pre_trade.short_price_min" :min="0" /></UFormField><UFormField label="Short price max"><UInputNumber v-model="settings.pre_trade.short_price_max" :min="0" /></UFormField></div>
        <div class="flex gap-1"><UButton size="sm" variant="outline" @click="requestPrice('long')">Select Long price on chart</UButton><UButton size="sm" variant="outline" @click="requestPrice('short')">Select Short price on chart</UButton></div>
        <div class="grid grid-cols-2 gap-2"><UFormField label="Entry size mode"><USelect v-model="settings.pre_trade.entry_size_mode" :items="['percent', 'usdt']" /></UFormField><UFormField :label="settings.pre_trade.entry_size_mode === 'percent' ? 'Capital %' : 'Entry USDT'"><UInputNumber v-model="settings.pre_trade.entry_size_value" :min="0" :max="settings.pre_trade.entry_size_mode === 'percent' ? 100 : undefined" /></UFormField><UFormField label="Leverage (1x-5x)"><UInputNumber v-model="settings.pre_trade.leverage" :min="1" :max="5" :step="1" /></UFormField></div>
        <UFormField label="Entry signal"><USegmentedControl v-model="settings.pre_trade.entry_signal" :items="[{ label: 'RSI', value: 'rsi' }, { label: 'EMA', value: 'ema' }, { label: 'Breakout', value: 'breakout' }, { label: 'All', value: 'all' }]" value-key="value" label-key="label" /></UFormField>
        <UFormField label="Entry strictness"><USlider v-model="settings.pre_trade.entry_strictness" :min="0" :max="100" :step="1" /><div class="flex justify-between text-xs text-muted"><span>Easy</span><span>{{ settings.pre_trade.entry_strictness }}%</span><span>Strict</span></div></UFormField>
        <UFormField label="Entry tag"><UInput v-model="settings.pre_trade.entry_tag" placeholder="Optional tag" /></UFormField>
      </div>
    </UCard>

    <UCard :ui="{ body: 'p-3 sm:p-4' }">
      <template #header><div class="flex items-center justify-between"><div><p class="text-xs uppercase tracking-wide text-muted">Open-trade risk</p><h3 class="text-lg font-semibold">Position management</h3></div><UBadge color="warning" variant="subtle">Live risk</UBadge></div></template>
      <div v-if="loading" class="text-sm text-muted">Loading controls...</div>
      <div v-else-if="settings" class="grid gap-3">
        <div class="border-b border-default pb-3"><div class="flex justify-between mb-2"><span class="font-medium">Stop loss</span><USwitch v-model="settings.risk.stoploss_enabled" /></div><div v-if="settings.risk.stoploss_enabled" class="grid grid-cols-2 gap-2"><UFormField label="Method"><USelect v-model="settings.risk.stoploss_mode" :items="['percent', 'price']" /></UFormField><UFormField :label="settings.risk.stoploss_mode === 'percent' ? 'Loss %' : 'Stop price'"><UInputNumber v-if="settings.risk.stoploss_mode === 'percent'" v-model="settings.risk.stoploss_percent" :max="0" :step="0.1" /><UInputNumber v-else v-model="settings.risk.stoploss_price" :min="0" /></UFormField></div></div>
        <div class="border-b border-default pb-3"><div class="flex justify-between mb-2"><span class="font-medium">Average down</span><USwitch v-model="settings.risk.averaging_enabled" /></div><div v-if="settings.risk.averaging_enabled" class="grid grid-cols-2 gap-2"><UFormField label="Loss trigger"><USelect v-model="settings.risk.averaging_trigger_mode" :items="['percent', 'usdt']" /></UFormField><UFormField :label="settings.risk.averaging_trigger_mode === 'percent' ? 'Negative loss %' : 'Loss USDT'"><UInputNumber v-model="settings.risk.averaging_trigger_value" :max="settings.risk.averaging_trigger_mode === 'percent' ? 0 : undefined" :step="0.1" /></UFormField><UFormField label="Increase size by"><USelect v-model="settings.risk.averaging_size_mode" :items="['percent', 'usdt']" /></UFormField><UFormField :label="settings.risk.averaging_size_mode === 'percent' ? 'Size %' : 'Size USDT'"><UInputNumber v-model="settings.risk.averaging_size_value" :min="0" /></UFormField></div></div>
        <div class="grid grid-cols-2 gap-2 border-b border-default pb-3"><UFormField label="Custom take profit"><USwitch v-model="settings.risk.take_profit_enabled" /></UFormField><UFormField v-if="settings.risk.take_profit_enabled" label="Profit %"><UInputNumber v-model="settings.risk.take_profit_percent" :min="0" :step="0.1" /></UFormField></div>
        <div class="border-b border-default pb-3"><div class="flex justify-between mb-2"><span class="font-medium">Inactive trade exit</span><USwitch v-model="settings.risk.inactivity_exit_enabled" /></div><div v-if="settings.risk.inactivity_exit_enabled" class="grid grid-cols-2 gap-2"><UFormField label="No-movement minutes"><UInputNumber v-model="settings.risk.inactivity_minutes" :min="1" /></UFormField><UFormField label="Exit if loss exceeds %"><UInputNumber v-model="settings.risk.inactivity_loss_percent" :max="0" :step="0.1" /></UFormField></div></div>
        <div class="grid grid-cols-2 gap-2"><UFormField label="Trailing stop"><USwitch v-model="settings.risk.trailing_stop_enabled" /></UFormField><UFormField v-if="settings.risk.trailing_stop_enabled" label="Trail %"><UInputNumber v-model="settings.risk.trailing_stop_percent" :min="0" :step="0.1" /></UFormField><UFormField label="Liquidation safety buffer %"><UInputNumber v-model="settings.risk.liquidation_buffer_percent" :min="0" :step="0.1" /></UFormField></div>
      </div>
    </UCard>
    <div class="xl:col-span-2 flex items-center justify-between gap-3"><p v-if="error" class="text-sm text-error">{{ error }}</p><span v-else class="text-xs text-muted">Changes are sent live to the bot.</span><UButton :loading="saving" :disabled="loading || !settings" icon="mdi:content-save" @click="save">Save pair controls</UButton></div>
  </div>
  <div v-else class="p-4 text-sm text-muted">Select a pair to configure its controls.</div>
</template>
