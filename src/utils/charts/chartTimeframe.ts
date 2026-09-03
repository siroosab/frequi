export function resolveDisplayTimeframe(
  selectedHigherTimeframe?: string,
  baseTimeframe?: string,
): string {
  const preferred = selectedHigherTimeframe?.trim();
  if (preferred) {
    return preferred;
  }

  const fallback = baseTimeframe?.trim();
  return fallback ?? '';
}
