import { expect, test } from '@playwright/test'

test('timeline image bytes and completed analyses survive a browser reload', async ({ page }) => {
  // A blank same-origin page exercises real IndexedDB without authentication,
  // external model calls, or the rest of the application's startup effects.
  await page.route('**/__timeline-storage-test', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Timeline storage test</title>' }))
  await page.goto('/__timeline-storage-test')
  const saved = await page.evaluate(async () => {
    const assetModulePath = '/src/features/projects/workflow/frame/debug/storage.ts'
    const resultModulePath = '/src/shared/workflowRuns/workflowCheckpointStore.ts'
    const { persistTimelineImageAsset } = await import(assetModulePath)
    const { createWorkflowStepResultStore } = await import(resultModulePath)
    const scope = {
      projectId: '0185f76a-9e4d-7ed6-9ef7-9f34e7e1b6fd',
      workflowRunId: '0185f76a-9e4d-7ed6-9ef7-9f34e7e1b6fe',
      workflowInputHash: 'a'.repeat(64), stepId: 'analyze-timeline-images.batch-v2.image-1',
    }
    const key = await persistTimelineImageAsset(scope.projectId, scope.workflowRunId, 0,
      new File(['timeline image bytes'], 'timeline.png', { type: 'image/png' }))
    await createWorkflowStepResultStore().saveStepResult(scope, { response: { success: true, content: 'saved analysis' } })
    return { key, scope }
  })
  expect(saved.key).toBeTruthy()
  await page.reload()
  const restored = await page.evaluate(async ({ key, scope }) => {
    const assetModulePath = '/src/features/projects/workflow/frame/debug/storage.ts'
    const resultModulePath = '/src/shared/workflowRuns/workflowCheckpointStore.ts'
    const { loadFrameDebugAsset } = await import(assetModulePath)
    const { createWorkflowStepResultStore } = await import(resultModulePath)
    const blob = await loadFrameDebugAsset(key)
    const result = await createWorkflowStepResultStore().getStepResult(scope)
    return { text: await blob?.text(), type: blob?.type, result }
  }, saved)
  expect(restored).toEqual({ text: 'timeline image bytes', type: 'image/png', result: { response: { success: true, content: 'saved analysis' } } })
})
