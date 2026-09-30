export function formatCurrency(minor: number): string {
  return `$${(minor / 100).toFixed(2)}`;
}
