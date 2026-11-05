// 认证功能模块统一导出
export { useAuth, AuthProvider } from './contexts/AuthContext'
export { default as ProtectedRoute, PublicRoute, PrivateRoute } from './components/ProtectedRoute'
export { default as AdminRoute } from './components/AdminRoute'
export { default as UserMenu } from './components/UserMenu'

// 导出类型
export type * from './types/auth'