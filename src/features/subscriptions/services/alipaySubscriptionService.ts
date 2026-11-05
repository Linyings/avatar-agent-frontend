import { authenticatedFetch } from '@/features/auth/services/authService'
import type {
  AlipayCheckoutResponse,
  AlipayPortalResponse,
  AlipaySyncRequest,
  AlipaySyncResponse,
} from '../types'

const apiBaseUrl = () => import.meta.env.VITE_API_BASE_URL || ''

async function post<T>(path: string, body?: unknown): Promise<T> {
  const response = await authenticatedFetch(`${apiBaseUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: '请求失败' }))
    throw new Error(error.detail || error.message || '请求失败')
  }
  return response.json()
}

export const alipaySubscriptionService = {
  createCheckout(planId: string): Promise<AlipayCheckoutResponse> {
    return post('/api/v1/subscriptions/alipay/checkout', { plan_id: planId, billing_cycle: 'monthly' })
  },

  syncReturn(data: AlipaySyncRequest): Promise<AlipaySyncResponse> {
    return post('/api/v1/subscriptions/alipay/sync', data)
  },

  createPortal(): Promise<AlipayPortalResponse> {
    return post('/api/v1/subscriptions/alipay/portal')
  },

  cancel(): Promise<{ status: string }> {
    return post('/api/v1/subscriptions/alipay/cancel')
  },

  redirectToCheckout(url: string) {
    window.location.assign(url)
  },
}

export default alipaySubscriptionService
