import {beforeEach, describe, expect, it, vi} from 'vitest'
import {avatarMvpService} from './avatarMvpService'
import {authenticatedFetch} from '@/features/auth/services/authService'

vi.mock('@/features/auth/services/authService',()=>({authenticatedFetch:vi.fn()}))
const fetchMock=vi.mocked(authenticatedFetch)
beforeEach(()=>vi.clearAllMocks())

describe('avatar MVP client',()=>{
  it('submits an idempotent multipart request without exposing provider keys',async()=>{
    fetchMock.mockResolvedValue(new Response(JSON.stringify({id:'task-1'}),{status:202}))
    await avatarMvpService.create(new File(['photo'],'a.png',{type:'image/png'}),'开场。讲解。总结。','标题','request-1')
    const [url,init]=fetchMock.mock.calls[0]
    expect(String(url)).toContain('/avatar-mvp/tasks')
    const form=init?.body as FormData
    expect(form.get('client_request_id')).toBe('request-1')
    expect(form.get('project_id')).toBeNull()
    expect(form.get('photo')).toBeInstanceOf(File)
    expect(init?.headers).toBeUndefined()
  })
  it('surfaces real service errors and does not retry paid submissions',async()=>{
    fetchMock.mockResolvedValue(new Response(JSON.stringify({message:'提交状态待确认'}),{status:409}))
    await expect(avatarMvpService.retry('task-1')).rejects.toThrow('提交状态待确认')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('retrieves the video using authentication, never a JWT query parameter',async()=>{
    fetchMock.mockResolvedValue(new Response(new Blob(['video'],{type:'video/mp4'})))
    const blob=await avatarMvpService.video('task-1')
    expect(blob.size).toBeGreaterThan(0)
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/tasks\/task-1\/video$/)
  })
  it('binds a new task to an existing project and treats a missing record as empty', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({id:'task-2'}),{status:202}))
    await avatarMvpService.create(new File(['photo'],'a.png',{type:'image/png'}),'开场。讲解。总结。','标题','request-2','project-1')
    expect((fetchMock.mock.calls[0][1]?.body as FormData).get('project_id')).toBe('project-1')
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({message:'任务不存在'}),{status:404}))
    await expect(avatarMvpService.latestForProject('project-1')).resolves.toBeNull()
  })
})
