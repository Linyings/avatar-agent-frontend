import { useState, useEffect, useCallback, useRef } from 'react'
import { 
  systemService, 
  withSystemErrorHandling
} from '@/shared/services/systemService'
import type {
  SystemSettingResponse,
  SystemSettingCreateRequest,
  SystemSettingUpdateRequest,
  SystemSettingsQueryParams
} from '@/shared/types/system'

// Hook 状态接口
interface UseSystemSettingsState {
  settings: SystemSettingResponse[]
  publicSettings: Record<string, unknown>
  isLoading: boolean
  isSaving: boolean
  error: string | null
}

// Hook 配置接口
interface UseSystemSettingsConfig {
  autoLoad?: boolean // 自动加载设置
  loadPublicSettings?: boolean // 加载公开设置
  filterParams?: SystemSettingsQueryParams // 过滤参数
}

// Hook 返回值接口
interface UseSystemSettingsReturn extends UseSystemSettingsState {
  // 数据操作
  loadSettings: (params?: SystemSettingsQueryParams) => Promise<void>
  loadPublicSettings: () => Promise<void>
  refreshSettings: () => Promise<void>
  
  // 设置操作
  createSetting: (data: SystemSettingCreateRequest) => Promise<SystemSettingResponse>
  updateSetting: (key: string, data: SystemSettingUpdateRequest) => Promise<SystemSettingResponse>
  deleteSetting: (key: string) => Promise<void>
  
  // 便捷方法
  getSetting: (key: string) => SystemSettingResponse | undefined
  getSettingValue: <T = unknown>(key: string, defaultValue?: T) => T | undefined
  getPublicSettingValue: <T = unknown>(key: string, defaultValue?: T) => T | undefined
  updateSettingValue: (key: string, value: object, description?: string) => Promise<SystemSettingResponse>
  
  // 批量操作
  bulkCreateSettings: (settings: SystemSettingCreateRequest[]) => Promise<SystemSettingResponse[]>
  
  // 工具方法
  clearError: () => void
}

export const useSystemSettings = (config: UseSystemSettingsConfig = {}): UseSystemSettingsReturn => {
  const {
    autoLoad = false, // 系统设置需要管理员权限，默认不自动加载
    loadPublicSettings = true,
    filterParams = {}
  } = config

  // 状态管理
  const [state, setState] = useState<UseSystemSettingsState>({
    settings: [],
    publicSettings: {},
    isLoading: false,
    isSaving: false,
    error: null
  })

  // 引用
  const mountedRef = useRef(true)

  // 安全的状态更新
  const safeSetState = useCallback((updater: Partial<UseSystemSettingsState> | ((prev: UseSystemSettingsState) => Partial<UseSystemSettingsState>)) => {
    if (mountedRef.current) {
      setState(prevState => ({
        ...prevState,
        ...(typeof updater === 'function' ? updater(prevState) : updater)
      }))
    }
  }, [])

  // 加载系统设置列表
  const loadSettings = useCallback(async (params: SystemSettingsQueryParams = {}) => {
    if (!mountedRef.current) return

    safeSetState({ isLoading: true, error: null })

    try {
      const mergedParams = {
        ...filterParams,
        ...params
      }

      const settings = await withSystemErrorHandling(() => 
        systemService.getSystemSettings(mergedParams)
      )

      if (settings) {
        safeSetState({
          settings,
          isLoading: false
        })
      }
    } catch (error) {
      safeSetState({
        error: (error as Error).message,
        isLoading: false
      })
    }
  }, [safeSetState, filterParams])

  // 加载公开设置
  const loadPublicSettingsData = useCallback(async () => {
    if (!mountedRef.current) return

    try {
      const response = await withSystemErrorHandling(() => 
        systemService.getPublicSystemSettings()
      )

      if (response) {
        safeSetState({
          publicSettings: response.settings
        })
      }
    } catch (error) {
      console.error('加载公开设置失败:', error)
      // 公开设置失败不应该影响主要功能，只记录错误
    }
  }, [safeSetState])

  // 刷新设置
  const refreshSettings = useCallback(async () => {
    const loadPromises = []
    
    if (state.settings.length > 0) {
      loadPromises.push(loadSettings())
    }
    
    if (loadPublicSettings) {
      loadPromises.push(loadPublicSettingsData())
    }

    await Promise.all(loadPromises)
  }, [state.settings.length, loadSettings, loadPublicSettings])

  // 创建设置
  const createSetting = useCallback(async (data: SystemSettingCreateRequest): Promise<SystemSettingResponse> => {
    safeSetState({ isSaving: true, error: null })

    try {
      const setting = await withSystemErrorHandling(() => 
        systemService.createSystemSetting(data)
      )

      if (setting) {
        // 添加到设置列表
        safeSetState((prevState) => ({
          settings: [setting, ...prevState.settings],
          isSaving: false
        }))

        // 如果是公开设置，更新公开设置
        if (setting.is_public) {
          await loadPublicSettingsData()
        }

        return setting
      }

      throw new Error('创建设置失败')
    } catch (error) {
      safeSetState({
        error: (error as Error).message,
        isSaving: false
      })
      throw error
    }
  }, [safeSetState, loadPublicSettings])

  // 更新设置
  const updateSetting = useCallback(async (key: string, data: SystemSettingUpdateRequest): Promise<SystemSettingResponse> => {
    safeSetState({ isSaving: true, error: null })

    try {
      const setting = await withSystemErrorHandling(() => 
        systemService.updateSystemSetting(key, data)
      )

      if (setting) {
        // 更新设置列表
        safeSetState((prevState) => ({
          settings: prevState.settings.map(prevSetting =>
            prevSetting.key === key ? setting : prevSetting
          ),
          isSaving: false
        }))

        // 如果是公开设置，更新公开设置
        if (setting.is_public) {
          await loadPublicSettingsData()
        }

        return setting
      }

      throw new Error('更新设置失败')
    } catch (error) {
      safeSetState({
        error: (error as Error).message,
        isSaving: false
      })
      throw error
    }
  }, [safeSetState, loadPublicSettings])

  // 删除设置
  const deleteSetting = useCallback(async (key: string) => {
    safeSetState({ isSaving: true, error: null })

    try {
      await withSystemErrorHandling(() => 
        systemService.deleteSystemSetting(key)
      )

      // 从设置列表中移除
      safeSetState((prevState) => ({
        settings: prevState.settings.filter(setting => setting.key !== key),
        isSaving: false
      }))

      // 刷新公开设置
      if (loadPublicSettings) {
        await loadPublicSettingsData()
      }
    } catch (error) {
      safeSetState({
        error: (error as Error).message,
        isSaving: false
      })
      throw error
    }
  }, [safeSetState, loadPublicSettings])

  // 获取特定设置
  const getSetting = useCallback((key: string) => {
    return state.settings.find(setting => setting.key === key)
  }, [state.settings])

  // 获取设置值
  const getSettingValue = useCallback(<T = unknown>(key: string, defaultValue?: T): T | undefined => {
    const setting = getSetting(key)
    return setting ? (setting.value as T) : defaultValue
  }, [getSetting])

  // 获取公开设置值
  const getPublicSettingValue = useCallback(<T = unknown>(key: string, defaultValue?: T): T | undefined => {
    return (state.publicSettings[key] as T) ?? defaultValue
  }, [state.publicSettings])

  // 更新设置值（便捷方法）
  const updateSettingValue = useCallback(async (key: string, value: object, description?: string): Promise<SystemSettingResponse> => {
    return await updateSetting(key, { value, description })
  }, [updateSetting])

  // 批量创建设置
  const bulkCreateSettings = useCallback(async (settings: SystemSettingCreateRequest[]): Promise<SystemSettingResponse[]> => {
    safeSetState({ isSaving: true, error: null })

    try {
      const createdSettings = await withSystemErrorHandling(() => 
        systemService.bulkCreateSystemSettings(settings)
      )

      if (createdSettings) {
        // 添加到设置列表
        safeSetState((prevState) => ({
          settings: [...createdSettings, ...prevState.settings],
          isSaving: false
        }))

        // 检查是否有公开设置需要刷新
        const hasPublicSettings = createdSettings.some(setting => setting.is_public)
        if (hasPublicSettings && loadPublicSettings) {
          await loadPublicSettingsData()
        }

        return createdSettings
      }

      throw new Error('批量创建设置失败')
    } catch (error) {
      safeSetState({
        error: (error as Error).message,
        isSaving: false
      })
      throw error
    }
  }, [safeSetState, loadPublicSettings])

  // 清除错误
  const clearError = useCallback(() => {
    safeSetState({ error: null })
  }, [safeSetState])

  // 管理组件挂载状态
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // 初始化数据加载
  useEffect(() => {
    if (autoLoad) {
      loadSettings()
    }

    if (loadPublicSettings) {
      loadPublicSettingsData()
    }
  }, [autoLoad, loadPublicSettings])

  return {
    // 状态
    ...state,
    
    // 数据操作
    loadSettings,
    loadPublicSettings: loadPublicSettingsData,
    refreshSettings,
    
    // 设置操作
    createSetting,
    updateSetting,
    deleteSetting,
    
    // 便捷方法
    getSetting,
    getSettingValue,
    getPublicSettingValue,
    updateSettingValue,
    
    // 批量操作
    bulkCreateSettings,
    
    // 工具方法
    clearError
  }
}

// 专门用于获取公开设置的轻量级Hook
export const usePublicSettings = () => {
  return useSystemSettings({
    autoLoad: false,
    loadPublicSettings: true
  })
}

// 专门用于管理员管理设置的Hook
export const useAdminSystemSettings = (filterParams?: SystemSettingsQueryParams) => {
  return useSystemSettings({
    autoLoad: true,
    loadPublicSettings: true,
    filterParams
  })
}
