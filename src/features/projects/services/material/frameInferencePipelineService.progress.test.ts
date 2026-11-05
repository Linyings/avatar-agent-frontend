import { describe, expect, it } from 'vitest'
import { mapExtractAudioConversionProgress } from './frameInferencePipelineService'

describe('frameInferencePipelineService progress helpers', () => {
  it('maps Mediabunny conversion progress into the extract-audio progress window', () => {
    expect(mapExtractAudioConversionProgress(0)).toBe(18)
    expect(mapExtractAudioConversionProgress(0.5)).toBe(26)
    expect(mapExtractAudioConversionProgress(1)).toBe(34)
  })

  it('clamps invalid conversion progress before mapping', () => {
    expect(mapExtractAudioConversionProgress(-1)).toBe(18)
    expect(mapExtractAudioConversionProgress(Number.NaN)).toBe(18)
    expect(mapExtractAudioConversionProgress(2)).toBe(34)
  })
})
