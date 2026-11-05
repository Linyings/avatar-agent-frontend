import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Button, Center, Group, Loader, Modal, Paper, SegmentedControl, Stack, Text } from '@mantine/core'
import QRCodeModule from 'react-qr-code'
import type { CreditPaymentOrder, CreditPaymentProvider, TokenPackage } from '../types'
import { paymentService } from '../services/paymentService'

const QRCode = ((QRCodeModule as unknown as { default?: typeof QRCodeModule }).default ?? QRCodeModule)

interface Props {
  package: TokenPackage
  opened: boolean
  onClose: () => void
  onPaid: (order: CreditPaymentOrder) => void
}

export function CreditPaymentModal({ package: pkg, opened, onClose, onPaid }: Props) {
  const [provider, setProvider] = useState<CreditPaymentProvider>('wechat')
  const [order, setOrder] = useState<CreditPaymentOrder | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const paidRef = useRef(false)
  const autoCreateAttemptedRef = useRef(false)
  const alipayWindowRef = useRef<Window | null>(null)

  const closeAlipayWindow = useCallback(() => {
    const win = alipayWindowRef.current
    alipayWindowRef.current = null
    if (win && !win.closed) {
      win.close()
    }
  }, [])

  const openAlipayPage = useCallback((url: string) => {
    const win = window.open(url, '_blank')
    alipayWindowRef.current = win
  }, [])

  useEffect(() => {
    if (!opened) {
      closeAlipayWindow()
      setProvider('wechat')
      setOrder(null)
      setError(null)
      paidRef.current = false
      autoCreateAttemptedRef.current = false
    }
  }, [opened, closeAlipayWindow])

  const checkStatus = useCallback(async (outTradeNo: string) => {
    try {
      const next = await paymentService.getCreditPayment(outTradeNo)
      setOrder(next)
      if (next.status === 'paid' && !paidRef.current) {
        paidRef.current = true
        onPaid(next)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '查询支付状态失败')
    }
  }, [onPaid])

  useEffect(() => {
    if (!opened || !order || order.status !== 'pending') return
    const timer = window.setInterval(() => { void checkStatus(order.out_trade_no) }, 3000)
    return () => window.clearInterval(timer)
  }, [checkStatus, opened, order?.out_trade_no, order?.status])

  const create = useCallback(async (targetProvider: CreditPaymentProvider) => {
    setLoading(true)
    setError(null)
    // Open the Alipay cashier window synchronously so popup blockers do not
    // discard the redirect; the real URL is assigned after the order is ready.
    if (targetProvider === 'alipay') {
      const win = window.open('', '_blank')
      alipayWindowRef.current = win
    }
    try {
      const next = await paymentService.createCreditPayment(pkg.id, targetProvider)
      setOrder(next)
      if (targetProvider === 'alipay' && next.code_url) {
        const win = alipayWindowRef.current
        if (win && !win.closed) {
          win.location.href = next.code_url
        } else {
          openAlipayPage(next.code_url)
        }
      }
    } catch (err) {
      closeAlipayWindow()
      setError(err instanceof Error ? err.message : '生成支付订单失败')
    } finally {
      setLoading(false)
    }
  }, [closeAlipayWindow, openAlipayPage, pkg.id])

  // Auto-create the WeChat order on open so the QR loads immediately.
  useEffect(() => {
    if (opened && provider === 'wechat' && !order && !loading && !autoCreateAttemptedRef.current) {
      autoCreateAttemptedRef.current = true
      void create('wechat')
    }
  }, [opened, provider, order, loading, create])

  const close = () => {
    closeAlipayWindow()
    setProvider('wechat')
    setOrder(null)
    setError(null)
    paidRef.current = false
    autoCreateAttemptedRef.current = false
    onClose()
  }

  const providerName = provider === 'wechat' ? '微信支付' : '支付宝'

  return <Modal opened={opened} onClose={close} centered title="购买 Credits">
    <Stack>
      <SegmentedControl
        fullWidth
        value={provider ?? ''}
        onChange={(value) => { closeAlipayWindow(); setProvider(value as CreditPaymentProvider); setOrder(null); autoCreateAttemptedRef.current = false }}
        data={[{ label: '微信支付', value: 'wechat' }, { label: '支付宝', value: 'alipay' }]}
      />
      <Stack gap={2} align="center">
        <Text fw={700}>{pkg.display_name}</Text>
        <Text size="xl" fw={800}>¥{Number(pkg.price).toFixed(2)}</Text>
        <Text c="dimmed">{(pkg.total_credits_with_bonus ?? pkg.total_tokens_with_bonus).toLocaleString()} Credits · 购买后 30 天有效</Text>
      </Stack>
      <Alert color="yellow" variant="light" title="虚拟积分支付不予退款">
        虚拟积分充值到账后不支持无理由退款，误购不退，请确认充值套餐与金额后再支付。
      </Alert>
      {error && <Alert color="red">{error}</Alert>}
      {!order && <Button onClick={() => create(provider)} loading={loading} disabled={!provider}>{provider === 'alipay' ? '去支付宝支付' : '生成支付二维码'}</Button>}
      {provider === 'wechat' && order?.code_url && <Center><Stack align="center">
        <Paper data-testid="payment-qr" p="md" bg="white" style={{ width: 'min(280px, 75vw)', aspectRatio: '1' }}>
          <QRCode value={order.code_url} style={{ width: '100%', height: '100%' }} aria-label={`${providerName}支付二维码`} />
        </Paper>
        <Text>请使用{providerName}扫码</Text>
        <Text size="xs" c="dimmed">{order.out_trade_no}</Text>
      </Stack></Center>}
      {provider === 'alipay' && order?.status === 'pending' && order.code_url ? <Center><Stack align="center">
        <Text>请在支付宝页面完成扫码支付</Text>
        <Button variant="default" onClick={() => openAlipayPage(order.code_url!)}>打开支付宝支付页面</Button>
        <Text size="xs" c="dimmed">{order.out_trade_no}</Text>
      </Stack></Center> : null}
      {order?.status === 'pending' && <>
        <Center><Loader size="sm" /><Text ml="sm">等待支付...</Text></Center>
        <Group grow wrap="wrap">
          <Button variant="default" onClick={() => { void checkStatus(order.out_trade_no) }}>我已完成支付</Button>
          <Button variant="subtle" onClick={close}>取消</Button>
        </Group>
      </>}
      {order?.status === 'paid' && <Alert color="green">支付成功，Credits 已到账</Alert>}
      {order && order.status !== 'pending' && order.status !== 'paid' && <Alert color="red">支付未完成，请重新创建订单。</Alert>}
    </Stack>
  </Modal>
}
