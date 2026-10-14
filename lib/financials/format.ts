export function formatFinancialAmount(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const amount = (Math.abs(value) / 1000000).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return value < 0 ? `(${amount})` : amount;
}
export function financialDate(date: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(date.length === 10 ? date + 'T00:00:00Z' : date));
}
