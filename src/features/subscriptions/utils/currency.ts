export const USD_TO_CNY_RATE_FOR_WECHAT = 6.81

export function numericPrice(value: string | number | null | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function usdToWeChatCny(value: string | number | null | undefined): number {
  return Math.round(numericPrice(value) * USD_TO_CNY_RATE_FOR_WECHAT * 100) / 100
}

export function formatUSD(value: string | number | null | undefined): string {
  return `$${numericPrice(value).toFixed(2)}`
}

export function formatCNY(value: string | number | null | undefined): string {
  return `¥${numericPrice(value).toFixed(2)}`
}
