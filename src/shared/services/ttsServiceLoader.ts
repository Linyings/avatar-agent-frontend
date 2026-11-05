let ttsServiceModulePromise: Promise<typeof import('./ttsService')> | null = null

export function loadTTSService() {
  if (!ttsServiceModulePromise) {
    ttsServiceModulePromise = import('./ttsService')
  }

  return ttsServiceModulePromise
}
