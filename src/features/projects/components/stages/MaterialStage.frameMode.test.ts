import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readMaterialStage = () => readFileSync(
  resolve(process.cwd(), 'src/features/projects/components/stages/MaterialStage.tsx'),
  'utf8'
)

describe('MaterialStage frame mode routing', () => {
  it('keeps frame inference on the dedicated frame workbench instead of the normal config/script flow', () => {
    const content = readMaterialStage()

    expect(content).toContain('<FrameInferenceSetupStep />')
    expect(content).toContain("if (currentStep === 'config')")
    expect(content).toContain("navigate(`/projects/${currentProject.id}/material/upload${frameQuery}`")
    expect(content).toContain('RetiredInferenceModeNotice')
    expect(content).not.toContain('shouldPreferConfigStep')
    expect(content).not.toContain('VideoUploadStep')
    expect(content).not.toContain('ConfigurationStep')
    expect(content).not.toContain('DeepReasoningSetupStep')
    expect(content).not.toContain("navigate(`/projects/${currentProject.id}/analysis`, { replace: true })")
  })
})
