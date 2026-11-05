import React from 'react'
import { Box, Center, Loader, Stack, Text, Title } from '@mantine/core'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getPostLoginDestination } from '../utils/postLoginDestination'

interface ProtectedRouteProps {
  children: React.ReactNode
  requireAuth?: boolean
  redirectTo?: string
}

const shellStyle = {
  minHeight: '100vh',
  background: '#171717'
} as const

/**
 * 路由保护组件
 *
 * @param children - 要保护的子组件
 * @param requireAuth - 是否需要认证，默认为 true
 * @param redirectTo - 重定向路径，默认为 "/login"
 */
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requireAuth = true,
  redirectTo = '/login'
}) => {
  const { isAuthenticated, isLoading, isInitialized } = useAuth()
  const location = useLocation()

  if (requireAuth) {
    if (!isInitialized || isLoading) {
      return <LoadingPage />
    }

    if (!isAuthenticated) {
      return (
        <Navigate
          to={redirectTo}
          state={{ from: location }}
          replace
        />
      )
    }

    return <>{children}</>
  }

  if (!isInitialized) {
    return <LoadingPage />
  }

  if (isAuthenticated) {
    return (
      <Navigate
        to={getPostLoginDestination(location.state)}
        replace
      />
    )
  }

  return <>{children}</>
}

const LoadingPage: React.FC = () => {
  return (
    <Center style={shellStyle}>
      <Stack align="center" gap="lg">
        <Box style={{ color: '#6b9aff', width: '4rem', height: '4rem' }}>
          <svg fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
            <path d="M44 4H30.6666V17.3334H17.3334V30.6666H4V44H44V4Z" fill="currentColor" />
          </svg>
        </Box>

        <Loader color="#6b9aff" size="md" type="oval" />

        <Stack align="center" gap={4}>
          <Title order={2} c="white" fz="1.25rem" fw={600}>
            加载中
          </Title>
          <Text c="dimmed">正在验证您的身份...</Text>
        </Stack>
      </Stack>
    </Center>
  )
}

export const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <ProtectedRoute requireAuth={false}>
      {children}
    </ProtectedRoute>
  )
}

export const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <ProtectedRoute requireAuth={true}>
      {children}
    </ProtectedRoute>
  )
}

export default ProtectedRoute
