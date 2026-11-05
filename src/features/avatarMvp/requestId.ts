// crypto.randomUUID requires HTTPS; crypto.getRandomValues also works on the
// local WSL HTTP IP. Both paths keep the server's UUID idempotency contract.
export function createAvatarRequestId(): string {
  try {
    if (globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID()
  } catch { /* Fall back when the browser restricts randomUUID. */ }
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 15) | 64
  bytes[8] = (bytes[8] & 63) | 128
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`
}
