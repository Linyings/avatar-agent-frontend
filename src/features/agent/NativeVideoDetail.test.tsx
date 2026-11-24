import {afterEach,expect,it,vi} from 'vitest'
import {cleanup,render,screen} from '@testing-library/react'
import {MantineProvider} from '@mantine/core'
import {materialFixture} from './materialNodes.fixture'
import NativeVideoDetail from './NativeVideoDetail'
vi.mock('./StudioShell',()=>({ProtectedMedia:({kind,url}:{kind:string;url:string})=><div data-testid={`media-${kind}`} data-url={url}/>}))
afterEach(cleanup)
it('previews native video while material planning is still pending and exposes the real failed phase',()=>{
 const state=materialFixture(),run=state.run!;run.input.speech_mode='native-video'
 run.needs=[];run.materials=[];run.status='failed';run.stage='F04/p1'
 run.segments[0].native_video='p1/native.mp4'
 run.artifacts=[{id:'native-p1',name:'人物原声.mp4',media_type:'video/mp4'}]
 run.steps=[{id:'F04/p1',status:'failed',seconds:3,error:'字幕时间识别失败'}]
 render(<MantineProvider><NativeVideoDetail state={state} segmentId="p1" onClose={vi.fn()}/></MantineProvider>)
 expect(screen.getByText('数字人视频（含原声） · 开场')).toBeVisible()
 expect(screen.getByTestId('media-video')).toHaveAttribute('data-url','/api/v1/avatar-mvp/runs/r/artifacts/native-p1')
 expect(screen.queryByTestId('media-audio')).not.toBeInTheDocument()
 expect(screen.getByText('字幕时间识别失败')).toBeVisible()
 expect(screen.queryByRole('button',{name:'执行到此步骤'})).not.toBeInTheDocument()
})
