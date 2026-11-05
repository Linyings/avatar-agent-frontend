import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  buildBackgroundMusicSelectOptions,
  type BackgroundMusicOption,
} from '../constants/backgroundMusic.constants'
import { fetchBackgroundMusicOptions } from '../services/backgroundMusicService'
import { useI18n } from '@/shared/i18n/I18nProvider'

export function useBackgroundMusicOptions() {
  const { locale, t } = useI18n()
  const [options, setOptions] = useState<BackgroundMusicOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const isMountedRef = useRef(false)
  const requestIdRef = useRef(0)

  const reload = useCallback(() => {
    const requestId = ++requestIdRef.current
    setIsLoading(true)
    setError(null)
    setOptions([])

    void fetchBackgroundMusicOptions()
      .then((items) => {
        if (!isMountedRef.current || requestId !== requestIdRef.current) return
        setOptions(items)
      })
      .catch((err: unknown) => {
        if (!isMountedRef.current || requestId !== requestIdRef.current) return
        setError(err instanceof Error ? err.message : '背景音乐加载失败')
        setOptions([])
      })
      .finally(() => {
        if (isMountedRef.current && requestId === requestIdRef.current) {
          setIsLoading(false)
        }
      })
  }, [])

  useEffect(() => {
    isMountedRef.current = true
    reload()

    return () => {
      isMountedRef.current = false
    }
  }, [reload])

  const selectOptions = useMemo(
    () => buildBackgroundMusicSelectOptions(options, locale).map(option => ({
      ...option,
      label: t(option.label),
    })),
    [locale, options, t]
  )

  return {
    options,
    selectOptions,
    isLoading,
    error,
    reload,
  }
}
