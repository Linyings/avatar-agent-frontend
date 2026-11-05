import React, { useEffect, useRef } from 'react'
import {
  Alert,
  Button,
  Center,
  Loader,
  Modal,
  Paper,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core'
import { CheckCircleIcon, ExclamationCircleIcon } from '@/shared/icons/tabler'
import QRCodeModule from 'react-qr-code'
import { usePayment } from '../hooks/usePayment'

const QRCode = (
  (QRCodeModule as unknown as { QRCode?: typeof QRCodeModule }).QRCode ??
  (QRCodeModule as unknown as { default?: typeof QRCodeModule }).default ??
  QRCodeModule
)

interface SubscriptionPaymentProps {
  mode?: 'subscription'
  planId: string
  planName: string
  billingCycle: 'monthly' | 'yearly'
  amount: string
  packageId?: never
  packageName?: never
  tokenAmount?: never
  bonusTokens?: never
}

interface TokenRechargeProps {
  mode: 'token'
  packageId: string
  packageName: string
  tokenAmount: number
  bonusTokens?: number
  amount: string
  planId?: never
  planName?: never
  billingCycle?: never
}

type WeChatPaymentModalProps = {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
} & (SubscriptionPaymentProps | TokenRechargeProps)

export const WeChatPaymentModal: React.FC<WeChatPaymentModalProps> = (props) => {
  const { isOpen, onClose, onSuccess, amount } = props

  const mode = props.mode || 'subscription'
  const isTokenMode = mode === 'token'

  const {
    payment,
    isCreating,
    isPolling,
    error,
    createPayment,
    createTokenRecharge,
    startPolling,
    stopPolling,
    resetPayment,
  } = usePayment()
  const pollingStartedRef = useRef(false)

  useEffect(() => {
    if (!isOpen) {
      pollingStartedRef.current = false
      resetPayment()
    }
  }, [isOpen, resetPayment])

  useEffect(() => {
    if (isOpen && !payment && !isCreating) {
      pollingStartedRef.current = false

      if (isTokenMode && 'packageId' in props && props.packageId) {
        createTokenRecharge(props.packageId).catch((err) => {
          console.error('创建Credits充值订单失败:', err)
        })
      } else if (!isTokenMode && 'planId' in props && 'billingCycle' in props && props.planId && props.billingCycle) {
        createPayment({
          plan_id: props.planId,
          billing_cycle: props.billingCycle,
        }).catch((err) => {
          console.error('创建订阅支付订单失败:', err)
        })
      }
    }
  }, [isOpen, isTokenMode])

  useEffect(() => {
    if (payment && !isPolling && !pollingStartedRef.current) {
      pollingStartedRef.current = true
      startPolling(
        payment.out_trade_no,
        (completedPayment) => {
          if (completedPayment.trade_state === 'SUCCESS') {
            onSuccess?.()
            setTimeout(() => {
              onClose()
            }, 2000)
          }
        },
        mode
      ).catch((err) => {
        console.error('支付轮询失败:', err)
      })
    }
  }, [payment?.out_trade_no, mode])

  const handleClose = () => {
    stopPolling()
    onClose()
  }

  const title = isTokenMode ? '微信扫码充值' : '微信扫码支付'
  const displayAmount = payment?.total_amount ?? amount

  return (
    <Modal
      opened={isOpen}
      onClose={handleClose}
      centered
      size="28rem"
      title={<Title order={3}>{title}</Title>}
      overlayProps={{ backgroundOpacity: 0.75, blur: 6 }}
    >
      <Stack gap="lg">
        <Stack gap={4} align="center">
          {isTokenMode && 'packageName' in props && props.packageName && props.tokenAmount !== undefined ? (
            <>
              <Text c="dimmed">{props.packageName}</Text>
              <Text size="2rem" fw={700} c="brand">¥{displayAmount}</Text>
              <Text size="sm" c="dimmed">
                获得 {props.tokenAmount.toLocaleString()} Credits
                {props.bonusTokens && props.bonusTokens > 0 && (
                  <Text span c="yellow"> (含赠送 {props.bonusTokens.toLocaleString()})</Text>
                )}
              </Text>
            </>
          ) : !isTokenMode && 'planName' in props && 'billingCycle' in props ? (
            <>
              <Text c="dimmed">
                {props.planName} - {props.billingCycle === 'monthly' ? '月付' : '年付'}
              </Text>
              <Text size="2rem" fw={700} c="brand">¥{amount}</Text>
            </>
          ) : null}
        </Stack>

        {isCreating && (
          <Center py="xl">
            <Stack align="center" gap="sm">
              <Loader color="brand" size="lg" />
              <Text c="dimmed">正在生成支付二维码...</Text>
            </Stack>
          </Center>
        )}

        {error && (
          <Alert color="red" variant="light" title="支付创建失败">
            {error}
          </Alert>
        )}

        {payment && payment.code_url && (payment.trade_state === 'NOTPAY' || !payment.trade_state) && (
          <Stack align="center" gap="md">
            <Paper p="md" radius="lg" shadow="sm" bg="white">
              <QRCode
                value={payment.code_url}
                size={256}
                level="H"
                style={{ height: 'auto', maxWidth: '100%', width: '100%' }}
              />
            </Paper>

            <Stack align="center" gap={4}>
              <Text fw={600}>请使用微信扫描二维码完成支付</Text>
              <Text size="sm" c="dimmed">订单号: {payment.out_trade_no}</Text>
              {(payment as { expires_in?: number }).expires_in && (
                <Text size="xs" c="dimmed">
                  订单将在 {Math.floor(((payment as { expires_in: number }).expires_in) / 60)} 分钟后过期
                </Text>
              )}
              {'time_expire' in payment && payment.time_expire && (
                <Text size="xs" c="dimmed">
                  订单将在 {new Date(payment.time_expire).toLocaleString()} 过期
                </Text>
              )}
            </Stack>

            {isPolling && (
              <Paper withBorder radius="lg" p="sm">
                <Center>
                  <Stack align="center" gap={4}>
                    <Loader color="brand" size="sm" />
                    <Text size="sm" c="dimmed">等待支付...</Text>
                  </Stack>
                </Center>
              </Paper>
            )}
          </Stack>
        )}

        {payment && payment.trade_state === 'SUCCESS' && (
          <Center py="lg">
            <Stack align="center" gap="sm">
              <ThemeIcon size={64} radius="xl" color="green" variant="light">
                <CheckCircleIcon className="h-8 w-8" />
              </ThemeIcon>
              <Text size="xl" fw={700} c="green">支付成功！</Text>
              <Text size="sm" c="dimmed">订单号: {payment.out_trade_no}</Text>
              {'success_time' in payment && payment.success_time && (
                <Text size="xs" c="dimmed">{new Date(payment.success_time).toLocaleString()}</Text>
              )}
            </Stack>
          </Center>
        )}

        {payment && (
          payment.trade_state === 'CLOSED' ||
          payment.trade_state === 'REVOKED' ||
          payment.trade_state === 'PAYERROR'
        ) && (
          <Center py="lg">
            <Stack align="center" gap="sm">
              <ThemeIcon size={64} radius="xl" color="yellow" variant="light">
                <ExclamationCircleIcon className="h-8 w-8" />
              </ThemeIcon>
              <Text size="xl" fw={700} c="yellow">
                {'trade_state_desc' in payment && payment.trade_state_desc ? payment.trade_state_desc : '支付失败'}
              </Text>
              <Text size="sm" c="dimmed">订单号: {payment.out_trade_no}</Text>
            </Stack>
          </Center>
        )}

        <Button
          onClick={handleClose}
          variant={payment?.trade_state === 'SUCCESS' ? 'filled' : 'outline'}
        >
          {payment?.trade_state === 'NOTPAY' ? '取消支付' : '关闭'}
        </Button>
      </Stack>
    </Modal>
  )
}

export default WeChatPaymentModal
