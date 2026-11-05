import {describe,it,expect,vi} from 'vitest'
import {workflowService} from './workflowService'
import {authenticatedFetch} from '@/features/auth/services/authService'
vi.mock('@/features/auth/services/authService',()=>({authenticatedFetch:vi.fn()}))
describe('workflow client',()=>{
 it.each(['run','start','confirm','retry','stop'] as const)('normalizes absent collections in %s responses',async(method)=>{
  vi.mocked(authenticatedFetch).mockResolvedValueOnce(new Response(JSON.stringify({id:'r',descriptions:null,needs:null,input:{assets:null,angles:null}})))
  const run=method==='start'?await workflowService.start('p',1,'request'):method==='confirm'?await workflowService.confirm('r','script','v1'):await workflowService[method]('r')
  for(const key of ['segments','steps','events','needs','artifacts','descriptions','shots'] as const)expect(run[key]).toEqual([])
  expect(run.input.assets).toEqual([]);expect(run.input.angles).toEqual([])
 })
 it('stops only through the authenticated stop endpoint',async()=>{
  vi.mocked(authenticatedFetch).mockResolvedValueOnce(new Response(JSON.stringify({id:'r',status:'stopping'})))
  await workflowService.stop('r')
  expect(authenticatedFetch).toHaveBeenCalledWith(expect.stringContaining('/runs/r/stop'),expect.objectContaining({method:'POST'}))
 })
 it('keeps JWT out of media URLs and obtains a Blob',async()=>{
  vi.mocked(authenticatedFetch).mockResolvedValueOnce(new Response('media'))
  const blob=await workflowService.artifact('r','video')
  expect(blob).toBeInstanceOf(Blob)
  expect(vi.mocked(authenticatedFetch).mock.lastCall?.[0]).toMatch(/artifacts\/video$/)
 })
})
