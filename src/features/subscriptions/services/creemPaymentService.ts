import { subscriptionService } from './subscriptionService'
import { tokenAccountService } from './tokenAccountService'
import type { BillingCycle, CheckoutResponse, CreemCheckoutSyncRequest, CreemCheckoutSyncResponse, CreemCreditRechargeResponse } from '../types'

export const creemPaymentService = {
  async createSubscriptionCheckout(planId: string, billingCycle: BillingCycle): Promise<CheckoutResponse> {
    return subscriptionService.createCheckout({ plan_id: planId, billing_cycle: billingCycle })
  },

  async createCreditCheckout(packageId: string): Promise<CreemCreditRechargeResponse> {
    return tokenAccountService.createCreemRecharge(packageId)
  },

  async syncCheckout(data: CreemCheckoutSyncRequest): Promise<CreemCheckoutSyncResponse> {
    return subscriptionService.syncCreemCheckout(data)
  },

  redirectToCheckout(checkoutUrl: string) {
    window.location.assign(checkoutUrl)
  },
}

export default creemPaymentService
