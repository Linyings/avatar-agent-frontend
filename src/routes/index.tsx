import { lazy, Suspense } from 'react'
import { Navigate, Routes, Route, useParams, useSearchParams } from 'react-router-dom'
import { Center, Group, Loader, Text } from '@mantine/core'
import { PublicRoute, PrivateRoute, AdminRoute } from '@/features/auth'
import AppLayout from '@/shared/components/layout/AppLayout'

const HomePage = lazy(() => import('@/pages/HomePage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))
const NewHomePage = lazy(() => import('@/pages/NewHomePage'))
const ResourcesPage = lazy(() => import('@/pages/resources/ResourcesPage'))
const LoginPage = lazy(() => import('@/pages/LoginPage'))
const RegisterPage = lazy(() => import('@/pages/RegisterPage'))
const ForgotPasswordPage = lazy(() => import('@/pages/ForgotPasswordPage'))
const OAuthCallbackPage = lazy(() => import('@/pages/OAuthCallbackPage'))
const DesktopAuthorizationPage = lazy(() => import('@/pages/DesktopAuthorizationPage'))
const PrivacyPolicyPage = lazy(() => import('@/pages/PrivacyPolicyPage'))
const TermsOfServicePage = lazy(() => import('@/pages/TermsOfServicePage'))
const ProjectListPage = lazy(() => import('@/pages/ProjectListPage'))
const ProjectDetailPage = lazy(() => import('@/pages/ProjectDetailPage'))
const FrameInferenceDebugPage = lazy(() => import('@/features/projects/debug/FrameInferenceDebugPage'))
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const FlovaHomePage = lazy(() => import('@/pages/FlovaHomePage'))
const WorkspacePage = lazy(() => import('@/pages/WorkspacePage'))
const ProfilePage = lazy(() => import('@/pages/ProfilePage'))
const SubscriptionPage = lazy(() => import('@/pages/SubscriptionPage'))
const ConsumptionRecordsPage = lazy(() => import('@/pages/ConsumptionRecordsPage'))
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard'))
const AnnouncementsPage = lazy(() => import('@/pages/admin/AnnouncementsPage'))
const SystemSettingsPage = lazy(() => import('@/pages/admin/SystemSettingsPage'))
const BillingRatesPage = lazy(() => import('@/pages/admin/BillingRatesPage'))
const AnalyticsPage = lazy(() => import('@/pages/admin/AnalyticsPage'))
const SubscriptionPlansPage = lazy(() => import('@/pages/admin/subscriptions/SubscriptionPlansPage'))
const CreditPackagesPage = lazy(() => import('@/pages/admin/subscriptions/CreditPackagesPage'))
const UserManagementPage = lazy(() => import('@/pages/admin/UserManagementPage'))
const TtsVoiceManagementPage = lazy(() => import('@/pages/admin/TtsVoiceManagementPage'))

function RouteFallback() {
  return (
    <Center mih="40vh">
      <Group gap="sm">
        <Loader size="sm" />
        <Text c="dimmed">页面加载中...</Text>
      </Group>
    </Center>
  )
}

/** 旧「制作前沟通」链接重定向到工作台，并保留 topic 作为初始意图。 */
function LegacyPreProductionRedirect() {
  const { projectId = '' } = useParams<{ projectId: string }>()
  const [searchParams] = useSearchParams()
  const topic = searchParams.get('topic') ?? ''
  const target = `/workspace/${projectId}${topic ? `?intent=${encodeURIComponent(topic)}` : ''}`
  return <Navigate to={target} replace />
}

export default function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        {/* 门户首页 - 公开访问 */}
        <Route path="/" element={<NewHomePage />} />

        {/* 原首页保留（开发调试用）*/}
        <Route path="/home-legacy" element={<HomePage />} />

        {/* Flova 风格首页克隆 */}
        <Route path="/flova-home" element={<FlovaHomePage />} />

        {/* Agent 工作台 */}
        <Route path="/workspace/:projectId" element={
          <PrivateRoute>
            <WorkspacePage />
          </PrivateRoute>
        } />

        {/* 旧「制作前沟通」页面已废弃：意图解析与确认统一在 Agent 对话窗口完成。
            保留重定向，避免旧链接/书签 404。 */}
        <Route path="/pre-production/:projectId" element={<LegacyPreProductionRedirect />} />

        {/* SEO 资源矩阵 - 公开访问 */}
        <Route path="/resources" element={<ResourcesPage />} />
        <Route path="/resources/:slug" element={<ResourcesPage />} />
        <Route path="/cases" element={<Navigate to="/resources" replace />} />

        {/* 法律文档页面 - 公开访问 */}
        <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
        <Route path="/terms-of-service" element={<TermsOfServicePage />} />

        {/* 公共路由 - 不需要认证 */}
        <Route path="/login" element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        } />
        <Route path="/register" element={
          <PublicRoute>
            <RegisterPage />
          </PublicRoute>
        } />
        <Route path="/forgot-password" element={
          <PublicRoute>
            <ForgotPasswordPage />
          </PublicRoute>
        } />
        <Route path="/auth/oauth/callback" element={<OAuthCallbackPage />} />
        <Route path="/desktop/authorize" element={<DesktopAuthorizationPage />} />
        <Route path="/pricing" element={
          <Navigate to="/subscription" replace />
        } />

        {/* 私有路由 - 需要认证 */}
        <Route path="/avatar-mvp" element={<Navigate to="/" replace />} />
        <Route path="/dashboard" element={
          <PrivateRoute>
            <AppLayout>
              <DashboardPage />
            </AppLayout>
          </PrivateRoute>
        } />
        <Route path="/profile" element={
          <PrivateRoute>
            <AppLayout>
              <ProfilePage />
            </AppLayout>
          </PrivateRoute>
        } />
        <Route path="/subscription" element={
          <PrivateRoute>
            <AppLayout>
              <SubscriptionPage />
            </AppLayout>
          </PrivateRoute>
        } />
        <Route path="/consumption-records" element={
          <PrivateRoute>
            <AppLayout>
              <ConsumptionRecordsPage />
            </AppLayout>
          </PrivateRoute>
        } />
        <Route path="/projects" element={
          <PrivateRoute>
            <ProjectListPage />
          </PrivateRoute>
        } />
        <Route path="/projects/:projectId" element={
          <PrivateRoute>
            <ProjectDetailPage />
          </PrivateRoute>
        } />
        <Route path="/projects/:projectId/debug/frame-inference" element={
          <PrivateRoute>
            <AppLayout>
              <FrameInferenceDebugPage />
            </AppLayout>
          </PrivateRoute>
        } />
        <Route path="/projects/:projectId/:stage/:step?" element={
          <PrivateRoute>
            <ProjectDetailPage />
          </PrivateRoute>
        } />

        {/* 管理员路由 */}
        <Route path="/admin" element={
          <AdminRoute>
            <AppLayout>
              <AdminDashboard />
            </AppLayout>
          </AdminRoute>
        } />
        <Route path="/admin/announcements" element={
          <AdminRoute>
            <AppLayout>
              <AnnouncementsPage />
            </AppLayout>
          </AdminRoute>
        } />
        <Route path="/admin/settings" element={
          <AdminRoute>
            <AppLayout>
              <SystemSettingsPage />
            </AppLayout>
          </AdminRoute>
        } />
        <Route path="/admin/billing-rates" element={
          <AdminRoute>
            <AppLayout>
              <BillingRatesPage />
            </AppLayout>
          </AdminRoute>
        } />
        <Route path="/admin/analytics" element={
          <AdminRoute>
            <AppLayout>
              <AnalyticsPage />
            </AppLayout>
          </AdminRoute>
        } />
        <Route path="/admin/subscriptions/plans" element={
          <AdminRoute>
            <AppLayout>
              <SubscriptionPlansPage />
            </AppLayout>
          </AdminRoute>
        } />
        <Route path="/admin/credit-packages" element={
          <AdminRoute>
            <AppLayout>
              <CreditPackagesPage />
            </AppLayout>
          </AdminRoute>
        } />
        <Route path="/admin/users" element={
          <AdminRoute>
            <AppLayout>
              <UserManagementPage />
            </AppLayout>
          </AdminRoute>
        } />
        <Route path="/admin/tts-voices" element={
          <AdminRoute>
            <AppLayout>
              <TtsVoiceManagementPage />
            </AppLayout>
          </AdminRoute>
        } />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}
