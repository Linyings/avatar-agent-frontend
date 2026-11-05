import { localAudioStorageService } from '@/shared/services/localAudioStorageService'
import { localAssetStorageService } from '@/shared/services/localAssetStorageService'

export const cleanupDeletedProjectLocalData = async (projectId: string): Promise<void> => {
  const results = await Promise.allSettled([
    localAssetStorageService.deleteProjectAssets(projectId),
    localAudioStorageService.deleteProjectCachedData(projectId),
  ])

  const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
  if (failures.length > 0) {
    console.warn('[projectLocalCleanup] 删除项目本地缓存失败:', {
      projectId,
      errors: failures.map(result => result.reason),
    })
  }
}
