import {render,screen} from '@testing-library/react'
import {MantineProvider} from '@mantine/core'
import {describe,it,expect,vi} from 'vitest'
import QualityReview from './QualityReview'
vi.mock('./StudioShell',()=>({ProtectedMedia:()=>null}))
describe('render quality review',()=>{
 it('separates produced files from visual acceptance and exposes timed findings',()=>{
  render(<MantineProvider><QualityReview runId="run" report={{human_review:'not_reviewed',status:'needs_review',issues:[{code:'circle_face',message:'圆窗嘴部不完整',time:16.25,shot_id:'S3'}],shots:[{shot_id:'S3',frames:[]}]}}/></MantineProvider>)
  expect(screen.getByText(/16.25s/)).toBeInTheDocument()
  expect(screen.getByText(/圆窗嘴部不完整/)).toBeInTheDocument()
  expect(screen.getByText(/尚未完成人工审阅/)).toBeInTheDocument()
  expect(screen.queryByText('质量通过')).not.toBeInTheDocument()
 })
})
