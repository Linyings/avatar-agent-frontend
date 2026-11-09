import {afterEach,describe,expect,it,vi} from 'vitest'
import {authenticatedFetch} from '@/features/auth/services/authService'
import {subscribeAgentStream,type AgentStreamEvent} from './agentService'
vi.mock('@/features/auth/services/authService',()=>({authenticatedFetch:vi.fn()}))
afterEach(()=>{vi.useRealTimers();vi.clearAllMocks()})
describe('Agent tool progress stream',()=>{
 it('delivers running and done for one call and reconnects a cleanly closed stream',async()=>{
  vi.useFakeTimers()
  const events:AgentStreamEvent[]=[]
  const frame=(status:string)=>'data: '+JSON.stringify({type:'tool',turnId:'turn',callId:'call',tool:'avatar_inspect',status})+'\n\n'
  const stream=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(frame('running')+frame('done')));c.close()}})
  vi.mocked(authenticatedFetch).mockResolvedValueOnce(new Response(stream))
  const onError=vi.fn()
  const close=subscribeAgentStream('project',event=>events.push(event),onError)
  await vi.advanceTimersByTimeAsync(0)
  expect(events.map(e=>e.type==='tool'?e.status:'')).toEqual(['running','done'])
  expect(onError).toHaveBeenCalledOnce()
  close()
  await vi.advanceTimersByTimeAsync(2000)
  expect(authenticatedFetch).toHaveBeenCalledTimes(1)
 })
 it('reads named connection events again after a reconnect',async()=>{
  vi.useFakeTimers()
  const events:AgentStreamEvent[]=[]
  const makeStream=()=>new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('event: connected\ndata: {"projectId":"project"}\n\n'));c.close()}})
  vi.mocked(authenticatedFetch).mockResolvedValueOnce(new Response(makeStream())).mockResolvedValueOnce(new Response(makeStream()))
  const close=subscribeAgentStream('project',event=>events.push(event))
  await vi.advanceTimersByTimeAsync(1000)
  close()
  expect(events).toEqual([{type:'connected',projectId:'project'},{type:'connected',projectId:'project'}])
 })
})
