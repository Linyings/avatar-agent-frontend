import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('UserManagementPage hard delete affordance', () => {
  it('wires a permanent delete action through the admin user service', () => {
    const page = readFileSync(resolve(process.cwd(), 'src/pages/admin/UserManagementPage.tsx'), 'utf8')
    const service = readFileSync(resolve(process.cwd(), 'src/features/admin/services/adminUserService.ts'), 'utf8')

    expect(page).toContain('彻底删除用户')
    expect(page).toContain('adminUserService.deleteUserPermanently(user.id)')
    expect(page).toContain('aria-label={`彻底删除用户 ${user.display_name || user.username}`}')
    expect(service).toContain('async deleteUserPermanently(userId: string)')
    expect(service).toContain('httpClient.delete<UserDeleteResponse>(`/api/v1/admin/users/${userId}`)')
  })
})
