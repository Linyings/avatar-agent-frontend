import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ModalsProvider } from '@mantine/modals'
import { Notifications } from '@mantine/notifications'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import './styles/tokens.css'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from '@/features/auth'
import { AppMantineProvider } from '@/shared/mantine/AppMantineProvider'
import { I18nProvider } from '@/shared/i18n/I18nProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppMantineProvider>
      <ModalsProvider>
        <Notifications position="top-right" />
        <BrowserRouter>
          <I18nProvider>
            <AuthProvider>
              <Routes>
                <Route path="/*" element={<App />} />
              </Routes>
            </AuthProvider>
          </I18nProvider>
        </BrowserRouter>
      </ModalsProvider>
    </AppMantineProvider>
  </StrictMode>,
)
