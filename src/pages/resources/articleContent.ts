import bestAiClipGenerators from './articles/best-ai-clip-generators.md?raw'
import bestAiVideoEditorsWithFreeTrials from './articles/best-ai-video-editors-with-free-trials.md?raw'
import bestFreeAiSubtitleGeneratorsNoWatermark from './articles/best-free-ai-subtitle-generators-no-watermark.md?raw'
import bestOpusclipAlternatives from './articles/best-opusclip-alternatives.md?raw'
import bestToolsToTurnLongVideosIntoShorts from './articles/best-tools-to-turn-long-videos-into-shorts.md?raw'

const articleMarkdownBySlug = new Map([
  ['best-opusclip-alternatives', bestOpusclipAlternatives],
  ['best-ai-clip-generators', bestAiClipGenerators],
  ['best-ai-video-editors-with-free-trials', bestAiVideoEditorsWithFreeTrials],
  ['best-free-ai-subtitle-generators-no-watermark', bestFreeAiSubtitleGeneratorsNoWatermark],
  ['best-tools-to-turn-long-videos-into-shorts', bestToolsToTurnLongVideosIntoShorts],
])

export function getArticleMarkdown(slug: string) {
  return articleMarkdownBySlug.get(slug)
}

export function isArticleResource(slug: string) {
  return articleMarkdownBySlug.has(slug)
}
