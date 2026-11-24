import { beforeEach, expect, it, vi } from 'vitest'
import ProjectService from './projectService'
import { cleanupDeletedProjectLocalData } from './projectLocalCleanup'

vi.mock('./projectLocalCleanup', () => ({ cleanupDeletedProjectLocalData: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/features/auth/services/authService', () => ({
  authenticatedFetch: vi.fn((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init)),
  tokenManager: { getAccessToken: () => 'test-token' },
}))
beforeEach(() => { vi.clearAllMocks(); global.fetch = vi.fn() })

it('clears browser assets after the server confirms project deletion', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ success: true, data: { deleted: true } })))
  await ProjectService.deleteProject('project-a')
  expect(cleanupDeletedProjectLocalData).toHaveBeenCalledWith('project-a')
})

it('retains browser assets when a running project cannot be deleted', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ detail: '请先停止制作' }), { status: 409 }))
  await expect(ProjectService.deleteProject('project-a')).rejects.toThrow()
  expect(cleanupDeletedProjectLocalData).not.toHaveBeenCalled()
})
