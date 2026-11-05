import type { SubscriptionPlanResponse } from './types'

export const FIRST_MONTH_PROMO_PRICE = 3.9
export const FIRST_MONTH_PROMO_MONTHLY_PRICE = 9.9
export const YEARLY_SAVINGS_PERCENT = 20

const parsePlanPrice = (value: string | number | null | undefined) => Number(value)

export const hasFirstMonthPromotion = (plan: SubscriptionPlanResponse) => (
  Math.abs(parsePlanPrice(plan.price_monthly) - FIRST_MONTH_PROMO_MONTHLY_PRICE) < 0.001
)

export const formatCurrencyPrice = (currency: string | undefined, amount: number) => (
  `${currency || 'USD'} ${amount.toFixed(2)}`
)
