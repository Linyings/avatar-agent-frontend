import type { ReactNode } from 'react'
import { MantineProvider, localStorageColorSchemeManager } from '@mantine/core'
import { appCssVariablesResolver, appTheme } from './theme'

export const APP_COLOR_SCHEME_KEY = 'narrato-color-scheme'

export const appColorSchemeManager = localStorageColorSchemeManager({
  key: APP_COLOR_SCHEME_KEY,
})

interface AppMantineProviderProps {
  children: ReactNode
}

export function AppMantineProvider({ children }: AppMantineProviderProps) {
  return (
    <MantineProvider
      theme={appTheme}
      defaultColorScheme="dark"
      colorSchemeManager={appColorSchemeManager}
      cssVariablesResolver={appCssVariablesResolver}
    >
      {children}
    </MantineProvider>
  )
}
