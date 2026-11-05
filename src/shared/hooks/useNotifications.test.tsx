import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNotifications } from '@/shared/hooks/useNotifications'
import {
  globalNotificationManager,
  notificationService,
} from '@/shared/services/notificationService'
import { NotificationType } from '@/shared/types/system'

const futureNotification = {
  id: 'notification-future',
  user_id: 'user-1',
  type: NotificationType.SYSTEM,
  title: '未来通知',
  message: '用于测试轮询去重。',
  data: {},
  is_read: false,
  read_at: null,
  expires_at: null,
  created_at: '2099-01-01T00:00:00.000Z',
}

describe('useNotifications', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-09T08:00:00.000Z'))
  })

  afterEach(() => {
    globalNotificationManager.cleanup()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('deduplicates repeated notification events with the same id', () => {
    const { result, unmount } = renderHook(() =>
      useNotifications({ autoLoad: false, enablePolling: false })
    )

    act(() => {
      ;(globalNotificationManager as unknown as {
        triggerNotificationReceived: (notification: typeof futureNotification) => void
      }).triggerNotificationReceived(futureNotification)
      ;(globalNotificationManager as unknown as {
        triggerNotificationReceived: (notification: typeof futureNotification) => void
      }).triggerNotificationReceived(futureNotification)
    })

    expect(result.current.notifications).toHaveLength(1)
    expect(result.current.notifications[0].id).toBe(futureNotification.id)

    unmount()
  })

  it('polls every 30 seconds and emits unread notifications to listeners', async () => {
    const setIntervalSpy = vi.spyOn(window, 'setInterval')
    vi.spyOn(notificationService, 'getUnreadNotifications').mockResolvedValue([futureNotification])
    const onNotificationReceived = vi.fn()
    const removeListener = globalNotificationManager.addListener({ onNotificationReceived })

    ;(globalNotificationManager as unknown as { lastCheckTime: string }).lastCheckTime = '2000-01-01T00:00:00.000Z'
    globalNotificationManager.startPolling(30000)

    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 30000)
    const poll = setIntervalSpy.mock.calls[0]?.[0] as (() => Promise<void>) | undefined
    expect(poll).toBeTypeOf('function')

    await act(async () => {
      await poll?.()
    })

    expect(onNotificationReceived).toHaveBeenCalledTimes(1)
    expect(onNotificationReceived).toHaveBeenCalledWith(expect.objectContaining({
      id: futureNotification.id,
      title: '未来通知',
    }))
    expect(notificationService.getUnreadNotifications).toHaveBeenCalledTimes(1)

    removeListener()
  })
})
