export function money(amount: number | string, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency, maximumFractionDigits: 2
  }).format(Number(amount));
}
