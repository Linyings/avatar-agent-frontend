// 支付流程管理Hook - 支持订阅支付和Credits充值

import { useState, useCallback, useRef, useEffect } from 'react'
import { paymentService, tokenAccountService } from '../services'
import type {
  WeChatPaymentCreateRequest,
  WeChatPaymentResponse,
  TokenRechargeResponse,
} from '../types'

// 统一的支付响应类型 - 包含所有可能的字段
type UnifiedPaymentResponse = WeChatPaymentResponse | (TokenRechargeResponse & {
  trade_state?: string
  trade_state_desc?: string
  success_time?: string | null
  time_expire?: string | null
})

interface UsePaymentReturn {
  payment: UnifiedPaymentResponse | null
  isCreating: boolean
  isPolling: boolean
  error: string | null
  createPayment: (data: WeChatPaymentCreateRequest) => Promise<WeChatPaymentResponse>
  createTokenRecharge: (packageId: string) => Promise<TokenRechargeResponse>
  startPolling: (outTradeNo: string, onSuccess?: (payment: any) => void, mode?: 'subscription' | 'token') => Promise<void>
  stopPolling: () => void
  resetPayment: () => void
}

/**
 * 支付流程管理Hook - 支持订阅支付和Credits充值
 */
export const usePayment = (): UsePaymentReturn => {
  const [payment, setPayment] = useState<UnifiedPaymentResponse | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isPolling, setIsPolling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 用于取消轮询的标记
  const cancelSignalRef = useRef({ cancelled: false })
  // 用于在轮询中访问最新的 payment 状态
  const paymentRef = useRef<UnifiedPaymentResponse | null>(null)

  // 同步 payment 状态到 ref，确保轮询中能访问到最新值
  useEffect(() => {
    paymentRef.current = payment
  }, [payment])

  // 创建订阅支付订单
  const createPayment = useCallback(
    async (data: WeChatPaymentCreateRequest): Promise<WeChatPaymentResponse> => {
      try {
        setIsCreating(true)
        setError(null)
        const result = await paymentService.createWeChatPayment(data)
        setPayment(result)
        return result
      } catch (err) {
        const message = err instanceof Error ? err.message : '创建支付订单失败'
        setError(message)
        throw new Error(message)
      } finally {
        setIsCreating(false)
      }
    },
    []
  )

  // 创建Credits充值订单
  const createTokenRecharge = useCallback(
    async (packageId: string): Promise<TokenRechargeResponse> => {
      try {
        setIsCreating(true)
        setError(null)
        const result = await tokenAccountService.createRecharge(packageId)
        console.log('✅ Credits充值订单创建成功:', {
          hasCodeUrl: !!result.code_url,
          codeUrlLength: result.code_url?.length,
          outTradeNo: result.out_trade_no,
          expiresIn: result.expires_in
        })
        // 添加 trade_state 字段以兼容现有逻辑（初始状态为 NOTPAY）
        const paymentData = { ...result, trade_state: 'NOTPAY' } as any
        setPayment(paymentData)
        console.log('📦 设置初始 payment 状态:', {
          hasCodeUrl: !!paymentData.code_url,
          tradeState: paymentData.trade_state
        })
        return result
      } catch (err) {
        const message = err instanceof Error ? err.message : '创建充值订单失败'
        setError(message)
        throw new Error(message)
      } finally {
        setIsCreating(false)
      }
    },
    []
  )

  // 开始轮询支付状态 - 支持订阅和Credits充值两种模式
  const startPolling = useCallback(
    async (
      outTradeNo: string,
      onSuccess?: (payment: any) => void,
      mode: 'subscription' | 'token' = 'subscription'
    ): Promise<void> => {
      try {
        setIsPolling(true)
        setError(null)
        cancelSignalRef.current.cancelled = false

        if (mode === 'token') {
          // Credits充值轮询 - 根据后端接口文档
          const pollToken = async (): Promise<void> => {
            let attempts = 0
            const maxAttempts = 60
            const interval = 3000

            while (attempts < maxAttempts && !cancelSignalRef.current.cancelled) {
              try {
                attempts++
                console.log(`🔄 轮询Credits充值状态 [${attempts}/${maxAttempts}] | 订单号: ${outTradeNo}`)

                const status = await tokenAccountService.getPaymentStatus(outTradeNo)

                if (!cancelSignalRef.current.cancelled) {
                  // 使用 ref 获取最新的 payment 状态，保留原始的 code_url 和其他创建时的信息
                  const currentPayment = paymentRef.current
                  const updatedPayment = {
                    ...currentPayment,  // 保留创建订单时的所有字段（包括 code_url, expires_in 等）
                    out_trade_no: status.out_trade_no,
                    trade_state: status.trade_state,
                    trade_state_desc: status.trade_state_desc || '',
                    total_amount: status.total_amount,
                    success_time: status.success_time || undefined,
                  } as WeChatPaymentResponse

                  console.log('🔄 更新支付状态:', {
                    hasCodeUrl: !!updatedPayment.code_url,
                    tradeState: updatedPayment.trade_state,
                    outTradeNo: updatedPayment.out_trade_no
                  })

                  setPayment(updatedPayment)

                  // 检查是否支付成功（根据 trade_state）
                  if (status.trade_state === 'SUCCESS') {
                    console.log(`🎉 Credits充值成功 | 订单号: ${outTradeNo}`)
                    if (onSuccess) {
                      onSuccess(updatedPayment)
                    }
                    return
                  }

                  // 检查是否支付失败
                  if (status.trade_state === 'CLOSED' ||
                      status.trade_state === 'PAYERROR') {
                    console.warn(`⚠️ Credits充值失败 | 状态: ${status.trade_state}`)
                    return
                  }
                }

                // 等待下次轮询
                await new Promise(resolve => setTimeout(resolve, interval))
              } catch (err) {
                console.error('Credits充值轮询失败:', err)
                // 继续轮询
                await new Promise(resolve => setTimeout(resolve, interval))
              }
            }

            if (attempts >= maxAttempts) {
              throw new Error('支付超时，请重试')
            }
          }

          await pollToken()
        } else {
          // 订阅支付轮询（原有逻辑）
          const result = await paymentService.pollPaymentStatus(
            outTradeNo,
            3000, // 每3秒轮询一次
            60,   // 最多尝试60次（3分钟）
            (updatedPayment) => {
              // 每次状态更新时更新payment
              if (!cancelSignalRef.current.cancelled) {
                setPayment(updatedPayment)
              }
            },
            cancelSignalRef.current // 传递取消信号
          )

          // 轮询完成
          if (!cancelSignalRef.current.cancelled) {
            setPayment(result)

            // 如果支付成功，调用回调
            if (result.trade_state === 'SUCCESS' && onSuccess) {
              onSuccess(result)
            }
          }
        }
      } catch (err) {
        if (!cancelSignalRef.current.cancelled) {
          const message = err instanceof Error ? err.message : '支付状态查询失败'
          setError(message)
          console.error('支付轮询错误:', message)
        }
      } finally {
        if (!cancelSignalRef.current.cancelled) {
          setIsPolling(false)
        }
      }
    },
    []
  )

  // 停止轮询
  const stopPolling = useCallback(() => {
    cancelSignalRef.current.cancelled = true
    setIsPolling(false)
  }, [])

  // 重置支付状态
  const resetPayment = useCallback(() => {
    stopPolling()
    setPayment(null)
    setError(null)
  }, [stopPolling])

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      cancelSignalRef.current.cancelled = true
    }
  }, [])

  return {
    payment,
    isCreating,
    isPolling,
    error,
    createPayment,
    createTokenRecharge,
    startPolling,
    stopPolling,
    resetPayment,
  }
}

export default usePayment
