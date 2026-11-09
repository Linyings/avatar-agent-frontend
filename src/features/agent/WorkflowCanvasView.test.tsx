import {afterEach,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react'
import {MantineProvider} from '@mantine/core'
import type {ReactNode} from 'react'
import type {NodeProps} from '@xyflow/react'
import WorkflowCanvas from './WorkflowCanvasView'
import {materialFixture} from './materialNodes.fixture'
import type {StudioState} from './studioService'

const flow=vi.hoisted(()=>({fitView:vi.fn().mockResolvedValue(undefined),getNodes:vi.fn(()=>[]),getViewport:vi.fn(()=>({x:0,y:0,zoom:.25})),viewportInitialized:true}))
vi.mock('@/features/auth',()=>({useAuth:()=>({user:{user_id:'test-user'}})}))
vi.mock('./StudioShell',()=>({ProtectedMedia:()=>null}))
vi.mock('./workflowCanvas',async()=>({...await vi.importActual('./workflowCanvas'),layoutWorkflow:async()=>({})}))
vi.mock('@xyflow/react',async()=>({
 ...await vi.importActual('@xyflow/react'),
 ReactFlowProvider:({children}:{children:ReactNode})=><>{children}</>,
 ReactFlow:({children,nodes,nodeTypes}:{children:ReactNode;nodes:NodeProps[];nodeTypes:{workflow:React.ComponentType<NodeProps>}})=>{
  const Card=nodeTypes.workflow
  return <>{nodes.map(node=><Card key={node.id} {...node} selected={node.id==='F06/a1'}/>)}{children}</>
 },
 Handle:()=>null,Background:()=>null,Controls:()=>null,MiniMap:()=>null,
 Panel:({children}:{children:ReactNode})=><div>{children}</div>,
 useReactFlow:()=>flow,useViewport:()=>({x:0,y:0,zoom:.25}),
}))
afterEach(()=>{cleanup();vi.clearAllMocks();localStorage.clear()})
const ui=(state:StudioState)=><MantineProvider><WorkflowCanvas state={state} onOpen={()=>{}}/></MantineProvider>

it('marks the executing video and locates it even when another node is selected at a small zoom',async()=>{
 const state=materialFixture();state.run!.stage='F07/m1/scene-2'
 render(ui(state))
 const card=await screen.findByTestId('workflow-node-F07/m1')
 expect(within(card).getByText('正在执行',{exact:true})).toBeVisible()
 expect(within(screen.getByTestId('workflow-node-F06/a1')).queryByText('正在执行',{exact:true})).not.toBeInTheDocument()
 expect(within(screen.getByTestId('workflow-node-F10')).queryByText('正在执行',{exact:true})).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'定位正在执行的专用动效 · 开场'}))
 expect(flow.fitView).toHaveBeenLastCalledWith(expect.objectContaining({nodes:[{id:'F07/m1'}]}))
})

it.each(['paused','failed','awaiting_confirmation','succeeded'])('removes running markers when the run becomes %s, including stale step records',async status=>{
 const state=materialFixture();const view=render(ui(state))
 expect(await screen.findByRole('button',{name:'定位正在执行的专用动效 · 开场'})).toBeVisible()
 const next=structuredClone(state);next.run!.status=status
 view.rerender(ui(next))
 expect(screen.queryByText('正在执行',{exact:true})).not.toBeInTheDocument()
 expect(screen.queryByRole('button',{name:/定位正在执行的/})).not.toBeInTheDocument()
})
