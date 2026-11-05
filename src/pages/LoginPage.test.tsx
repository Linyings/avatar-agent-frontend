import { describe, expect, it } from 'vitest'
import { getPostLoginDestination } from './LoginPage'

describe('getPostLoginDestination', () => {
  it('preserves every desktop authorization query parameter', () => {
    expect(getPostLoginDestination({
      from: {
        pathname: '/desktop/authorize',
        search: '?request_id=req-1&state=state-1&locale=zh-CN',
      },
    })).toBe('/desktop/authorize?request_id=req-1&state=state-1&locale=zh-CN')
  })

  it.each(['https://attacker.example', '//attacker.example'])(
    'rejects unsafe destination %s',
    (pathname) => expect(getPostLoginDestination({
      from: { pathname, search: '?request_id=req-1&state=state-1' },
    })).toBe('/'),
  )
})
