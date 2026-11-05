import { createContext, useContext, useReducer, useEffect, type ReactNode } from 'react'
import type {
  AuthState,
  AuthContextType,
  UserLoginRequest,
  UserRegisterRequest,
  UserProfile,
  AuthError
} from '../types/auth'
import authService, { tokenManager } from '../services/authService'

// 认证状态动作类型
type AuthAction =
  | { type: 'AUTH_START' }
  | { type: 'AUTH_SUCCESS'; payload: UserProfile }
  | { type: 'AUTH_FAILURE'; payload: string }
  | { type: 'LOGOUT' }
  | { type: 'UPDATE_USER'; payload: UserProfile }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_INITIALIZED'; payload: boolean }

// 初始状态
const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  token: null,
  isAdmin: false,
  isInitialized: false
}

// 认证状态 reducer
function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'AUTH_START':
      return {
        ...state,
        isLoading: true
      }
    
    case 'AUTH_SUCCESS':
      return {
        ...state,
        user: action.payload,
        isAuthenticated: true,
        isLoading: false,
        token: tokenManager.getAccessToken(),
        isAdmin: action.payload?.is_admin || false,
        isInitialized: true
      }

    case 'AUTH_FAILURE':
      return {
        ...state,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        token: null,
        isAdmin: false,
        isInitialized: true
      }

    case 'LOGOUT':
      return {
        ...state,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        token: null,
        isAdmin: false,
        isInitialized: true
      }
    
    case 'UPDATE_USER':
      return {
        ...state,
        user: action.payload,
        isAuthenticated: true,
        isLoading: false,
        token: tokenManager.getAccessToken(),
        isAdmin: action.payload?.is_admin || false,
        isInitialized: true
      }
    
    case 'SET_LOADING':
      return {
        ...state,
        isLoading: action.payload
      }

    case 'SET_INITIALIZED':
      return {
        ...state,
        isInitialized: action.payload
      }
    
    default:
      return state
  }
}

// 创建认证上下文
const AuthContext = createContext<AuthContextType | undefined>(undefined)

// 认证提供者组件
interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, dispatch] = useReducer(authReducer, initialState)

  // 初始化认证状态
  useEffect(() => {
    initializeAuth()
  }, [])

  // 定时刷新 token
  useEffect(() => {
    if (state.isAuthenticated && state.token) {
      // 设置定时刷新 token（每25分钟刷新一次，token通常30分钟过期）
      const refreshInterval = setInterval(async () => {
        try {
          const refreshSuccessful = await authService.autoRefreshToken()
          if (!refreshSuccessful) {
            handleLogout()
            return
          }
          // 刷新成功后更新状态
          const user = tokenManager.getUser()
          const token = tokenManager.getAccessToken()
          if (user && token) {
            dispatch({ type: 'AUTH_SUCCESS', payload: user })
          }
        } catch (err) {
          console.error('Auto refresh failed:', err)
          handleLogout()
        }
      }, 25 * 60 * 1000) // 25分钟

      return () => clearInterval(refreshInterval)
    }
  }, [state.isAuthenticated, state.token])

  // 初始化认证状态
  const initializeAuth = async () => {
    dispatch({ type: 'SET_LOADING', payload: true })

    try {
      await tokenManager.hydrate()

      // 检查本地存储的认证信息
      const token = tokenManager.getAccessToken()
      const user = tokenManager.getUser()

      if (token && user) {
        // 验证 token 是否仍然有效
        try {
          const currentUser = await authService.getCurrentUser()
          dispatch({ type: 'AUTH_SUCCESS', payload: currentUser })
        } catch (error) {
          // token 可能已过期，尝试刷新
          const refreshSuccessful = await authService.autoRefreshToken()
          if (refreshSuccessful) {
            const refreshedUser = tokenManager.getUser()
            if (refreshedUser) {
              dispatch({ type: 'AUTH_SUCCESS', payload: refreshedUser })
            } else {
              dispatch({ type: 'AUTH_FAILURE', payload: 'Failed to get user after refresh' })
            }
          } else {
            dispatch({ type: 'AUTH_FAILURE', payload: 'Token refresh failed' })
          }
        }
      } else {
        dispatch({ type: 'AUTH_FAILURE', payload: 'No stored auth data' })
      }
    } catch (error) {
      console.error('Auth initialization failed:', error)
      dispatch({ type: 'AUTH_FAILURE', payload: 'Initialization failed' })
    }
  }

  // 登录
  const completeDesktopLogin = async (): Promise<void> => {
    dispatch({ type: 'AUTH_START' })

    try {
      await tokenManager.hydrate()
      if (!tokenManager.getAccessToken()) {
        throw new Error('Desktop session is unavailable')
      }

      const user = await authService.getCurrentUser()
      dispatch({ type: 'AUTH_SUCCESS', payload: user })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Desktop login failed'
      dispatch({ type: 'AUTH_FAILURE', payload: message })
      throw error
    }
  }

  const login = async (credentials: UserLoginRequest): Promise<void> => {
    dispatch({ type: 'AUTH_START' })

    try {
      await authService.login(credentials)
      
      // 获取完整的用户信息
      const user = await authService.getCurrentUser()
      dispatch({ type: 'AUTH_SUCCESS', payload: user })
    } catch (error) {
      const authError = error as AuthError
      dispatch({ type: 'AUTH_FAILURE', payload: authError.message })
      throw error
    }
  }

  // 注册
  const register = async (userData: UserRegisterRequest): Promise<void> => {
    dispatch({ type: 'AUTH_START' })

    try {
      await authService.register(userData)
      
      // 注册成功后自动登录
      await login({
        email: userData.email,
        password: userData.password
      })
    } catch (error) {
      const authError = error as AuthError
      dispatch({ type: 'AUTH_FAILURE', payload: authError.message })
      throw error
    }
  }

  // 登出
  const handleLogout = () => {
    const logoutRequest = authService.logout()
    tokenManager.clearTokens()
    dispatch({ type: 'LOGOUT' })

    void logoutRequest
      .catch((error) => {
        console.error('Logout request failed:', error)
      })
      .finally(() => {
        tokenManager.clearTokens()
      })
  }

  // 刷新 token
  const refreshToken = async (): Promise<void> => {
    try {
      await authService.refreshToken()
      const user = tokenManager.getUser()
      if (user) {
        dispatch({ type: 'AUTH_SUCCESS', payload: user })
      }
    } catch (error) {
      console.error('Token refresh failed:', error)
      handleLogout()
      throw error
    }
  }

  // 更新用户信息
  const updateUser = (user: UserProfile): void => {
    tokenManager.setUser(user)
    dispatch({ type: 'UPDATE_USER', payload: user })
  }

  const contextValue: AuthContextType = {
    ...state,
    login,
    register,
    completeDesktopLogin,
    logout: handleLogout,
    refreshToken,
    updateUser
  }

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  )
}

// 使用认证上下文的 Hook
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  
  return context
}

// 检查是否需要认证的 Hook
export function useRequireAuth(): AuthContextType {
  const auth = useAuth()
  
  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated) {
      // 重定向到登录页面
      window.location.href = '/login'
    }
  }, [auth.isLoading, auth.isAuthenticated])
  
  return auth
}

export default AuthContext
