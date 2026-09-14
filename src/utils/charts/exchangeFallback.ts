export function buildExchangeFallbackChain(primaryExchange: string): string[] {
  const normalized = (primaryExchange ?? '').trim().toLowerCase();
  const ordered = normalized ? [normalized] : [];

  const fallbackExchanges = ['binance', 'okx'];
  for (const exchange of fallbackExchanges) {
    if (exchange !== normalized && !ordered.includes(exchange)) {
      ordered.push(exchange);
    }
  }

  return ordered;
}
