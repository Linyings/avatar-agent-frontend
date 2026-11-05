import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('AnalysisStage frame mode guard', () => {
  it('redirects frame projects back to the frame result preview instead of rendering script editing', () => {
    const content = readFileSync(
      resolve(process.cwd(), 'src/features/projects/components/stages/AnalysisStage.tsx'),
      'utf8'
    )

    expect(content).toContain("const isAdvancedMode = inferenceMode === 'frame'")
    expect(content).toContain("navigate(`/projects/${currentProject.id}/material/upload?preview=final`, { replace: true })")
    expect(content).toContain('if (!currentProject?.id || isAdvancedMode) return')
    expect(content).toContain('正在打开通用模式结果...')
  })
})
