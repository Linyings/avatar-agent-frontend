import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {MantineProvider} from '@mantine/core'
import MaterialNodeDetail from './MaterialNodeDetail'
import {materialFixture} from './materialNodes.fixture'
const api=vi.hoisted(()=>({action:vi.fn()}))
vi.mock('./studioService',async()=>({...await vi.importActual('./studioService'),materialAction:api.action}))
vi.mock('./StudioShell',()=>({ProtectedMedia:()=> <div>实际视频预览</div>}))
beforeEach(()=>{vi.resetAllMocks()});afterEach(cleanup)
it('shows the exhausted retry budget, real cause and repair strategy',()=>{
 const s=materialFixture();s.run!.status='failed';
 s.run!.steps.push({id:'F07/m1/scene-2',status:'failed',seconds:3,error:'场景2关键内容未完整展示',retry:{last_error:'缩水未展示',strategy:'按3.07秒调整出场时间',automatic_retries:3,exhausted:true}});
 const assist=vi.fn();
 render(<MantineProvider><MaterialNodeDetail state={s} needId="m1" onRefresh={vi.fn()} onClose={vi.fn()} onAssist={assist}/></MantineProvider>);
 expect(screen.getByText(/自动重试 3\/3.*已停止自动重试/)).toBeVisible();
 expect(screen.getByText(/按3.07秒调整出场时间/)).toBeVisible();
 expect(screen.getByText(/等待你选择处理方式/)).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'交给 Agent 排查'}));
 expect(assist).toHaveBeenLastCalledWith('diagnose');
 fireEvent.click(screen.getByRole('button',{name:'调整或跳过此步骤'}));
 expect(assist).toHaveBeenLastCalledWith('adjust');
 expect(api.action).not.toHaveBeenCalled();
});
it('shows each motion phase and the exact prompt used by that phase',()=>{
 const s=materialFixture();s.run!.status='failed';
 s.run!.steps.push({id:'F07/m1/plan',status:'succeeded',seconds:2,generation_prompt:'只规划本段场景',prompt_input:{material_design:'当前设计'}},{id:'F07/m1/scene-2',status:'failed',seconds:3,error:'模型输出被截断',generation_prompt:'只绘制当前场景'});
 render(<MantineProvider><MaterialNodeDetail state={s} needId="m1" onRefresh={vi.fn()} onClose={vi.fn()}/></MantineProvider>);
 expect(screen.getAllByText('场景方案').length).toBeGreaterThan(0);
 expect(screen.getAllByText('场景 2 绘图代码').length).toBeGreaterThan(0);
 expect(screen.getByText('模型输出被截断')).toBeVisible();
 fireEvent.click(screen.getByText('查看实际提交的完整提示词'));
 expect(screen.getByText('只绘制当前场景')).toBeVisible();
 expect(screen.getByText(/"material_design": "当前设计"/)).toBeVisible();
 expect(api.action).not.toHaveBeenCalled();
});
it('edits a draft without starting generation, then generates only the chosen video',async()=>{
 const s=materialFixture();s.run!.status='paused';const refresh=vi.fn().mockResolvedValue(undefined)
 api.action.mockResolvedValue({status:'saved',draft:{base_run_id:'r',need_hash:'x',version:'v1',prompt:'新提示词'}})
 render(<MantineProvider><MaterialNodeDetail state={s} needId="m1" onRefresh={refresh} onClose={vi.fn()}/></MantineProvider>)
 fireEvent.change(screen.getByLabelText('提示词草稿'),{target:{value:'新提示词'}})
 fireEvent.click(screen.getByRole('button',{name:'保存提示词'}))
 await waitFor(()=>expect(api.action).toHaveBeenCalledWith('p','m1',expect.objectContaining({action:'save',prompt:'新提示词',base_run_id:'r',version:''})))
 await screen.findByText('提示词已保存，视频尚未重新生成。')
 expect(api.action).toHaveBeenCalledTimes(1)
 api.action.mockResolvedValue({status:'running',run_id:'r2'})
 fireEvent.click(screen.getByRole('button',{name:'重新生成此视频'}))
 await waitFor(()=>expect(api.action).toHaveBeenLastCalledWith('p','m1',expect.objectContaining({action:'generate',prompt:'新提示词',version:'v1',request_id:expect.any(String)})))
})
it('AI rewrite leaves a reviewable draft and ongoing production blocks only generation',async()=>{
 const s=materialFixture();api.action.mockResolvedValue({status:'saved',draft:{base_run_id:'r',need_hash:'x',version:'v1',prompt:'AI 的新提示词'}})
 render(<MantineProvider><MaterialNodeDetail state={s} needId="m1" onRefresh={vi.fn()} onClose={vi.fn()}/></MantineProvider>)
 expect(screen.getByRole('button',{name:'重新生成此视频'})).toBeDisabled()
 fireEvent.click(screen.getByRole('button',{name:'让 AI 改写提示词'}))
 await waitFor(()=>expect(screen.getByLabelText('提示词草稿')).toHaveValue('AI 的新提示词'))
 expect(api.action.mock.calls[0][2].action).toBe('improve')
})

