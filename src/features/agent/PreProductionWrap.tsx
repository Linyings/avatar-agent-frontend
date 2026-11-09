/**
 * PreProductionWrap — 路由包装器
 * 从 URL params 和 query 中提取 projectId / topic，
 * 传给 PreProductionPage
 */
import { useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/features/auth'
import { PreProductionPage } from './PreProductionPage'

export default function PreProductionWrap() {
  const { projectId = '' } = useParams<{ projectId: string }>()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const topic = searchParams.get('topic') ?? ''

  return (
    <PreProductionPage
      projectId={projectId}
      userId={user?.user_id ?? ''}
      initialTopic={topic}
    />
  )
}
