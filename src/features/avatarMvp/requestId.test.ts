import {describe, expect, it, vi} from 'vitest'
import {createAvatarRequestId} from './requestId'

describe('avatar request id', () => {
  it('produces a UUID v4 on a WSL HTTP IP where randomUUID is unavailable', () => {
    const random = vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(() => {throw new Error('unavailable')})
    try {
      const id = createAvatarRequestId()
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
      expect(createAvatarRequestId()).not.toBe(id)
    } finally { random.mockRestore() }
  })
})
