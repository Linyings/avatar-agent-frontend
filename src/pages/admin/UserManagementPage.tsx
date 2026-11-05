import React, { useCallback, useEffect, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Avatar,
  Badge,
  Button,
  Center,
  Group,
  Loader,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core'
import { modals } from '@mantine/modals'
import {
  BanknotesIcon,
  MagnifyingGlassIcon,
  NoSymbolIcon,
  PencilIcon,
  ShieldCheckIcon,
  TrashIcon,
  XMarkIcon,
} from '@/shared/icons/tabler'
import { adminUserService } from '@/features/admin/services/adminUserService'
import type {
  AdminUserDetail,
  AdminUserSummary,
  UserListQueryParams,
} from '@/features/admin/types/user'
import UserDetailModal from '@/features/admin/components/UserDetailModal'
import TokenAdjustmentModal from '@/features/admin/components/TokenAdjustmentModal'
import StatusUpdateModal from '@/features/admin/components/StatusUpdateModal'
import RoleUpdateModal from '@/features/admin/components/RoleUpdateModal'
import Pagination from '@/features/subscriptions/components/Pagination'
import AppPageShell from '@/shared/components/ui/AppPageShell'
import AdminBackButton from '@/shared/components/ui/AdminBackButton'

const booleanFilterOptions = {
  active: [
    { value: 'true', label: '已激活' },
    { value: 'false', label: '已封禁' },
  ],
  admin: [
    { value: 'true', label: '管理员' },
    { value: 'false', label: '普通用户' },
  ],
  verified: [
    { value: 'true', label: '已验证' },
    { value: 'false', label: '未验证' },
  ],
}

const sortableColumns = [
  { field: 'created_at', label: '注册时间' },
  { field: 'last_login_at', label: '最后登录' },
]

const UserManagementPage: React.FC = () => {
  const [users, setUsers] = useState<AdminUserSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)

  const [search, setSearch] = useState('')
  const [isActiveFilter, setIsActiveFilter] = useState<boolean | undefined>(undefined)
  const [isAdminFilter, setIsAdminFilter] = useState<boolean | undefined>(undefined)
  const [isVerifiedFilter, setIsVerifiedFilter] = useState<boolean | undefined>(undefined)
  const [orderBy, setOrderBy] = useState('created_at')
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')

  const [selectedUser, setSelectedUser] = useState<AdminUserSummary | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showTokenModal, setShowTokenModal] = useState(false)
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [showRoleModal, setShowRoleModal] = useState(false)
  const [userDetail, setUserDetail] = useState<AdminUserDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const params: UserListQueryParams = {
        page,
        per_page: perPage,
        order_by: orderBy,
        order,
      }

      if (search) params.search = search
      if (isActiveFilter !== undefined) params.is_active = isActiveFilter
      if (isAdminFilter !== undefined) params.is_admin = isAdminFilter
      if (isVerifiedFilter !== undefined) params.is_verified = isVerifiedFilter

      const response = await adminUserService.listUsers(params)

      setUsers(response.items)
      setTotal(response.total)
      setTotalPages(response.total_pages)
    } catch (err) {
      console.error('Failed to load users:', err)
      setError(err instanceof Error ? err.message : '加载用户列表失败')
    } finally {
      setLoading(false)
    }
  }, [page, perPage, search, isActiveFilter, isAdminFilter, isVerifiedFilter, orderBy, order])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  const handleResetSearch = () => {
    setSearch('')
    setIsActiveFilter(undefined)
    setIsAdminFilter(undefined)
    setIsVerifiedFilter(undefined)
    setPage(1)
  }

  const handleSort = (field: string) => {
    if (orderBy === field) {
      setOrder(order === 'asc' ? 'desc' : 'asc')
    } else {
      setOrderBy(field)
      setOrder('desc')
    }
    setPage(1)
  }

  const handleViewDetail = async (user: AdminUserSummary) => {
    setSelectedUser(user)
    setDetailLoading(true)
    setShowDetailModal(true)

    try {
      const detail = await adminUserService.getUserDetail(user.id)
      setUserDetail(detail)
    } catch (err) {
      console.error('Failed to load user detail:', err)
      setError(err instanceof Error ? err.message : '加载用户详情失败')
    } finally {
      setDetailLoading(false)
    }
  }

  const handleAdjustToken = (user: AdminUserSummary) => {
    setSelectedUser(user)
    setShowTokenModal(true)
  }

  const handleUpdateStatus = (user: AdminUserSummary) => {
    setSelectedUser(user)
    setShowStatusModal(true)
  }

  const handleUpdateRole = (user: AdminUserSummary) => {
    setSelectedUser(user)
    setShowRoleModal(true)
  }

  const handleDeleteUser = (user: AdminUserSummary) => {
    const label = user.display_name || user.username
    modals.openConfirmModal({
      title: '彻底删除用户',
      centered: true,
      children: (
        <Stack gap="sm">
          <Text size="sm">
            确定要彻底删除用户“{label}”吗？该账号、项目、Credits 记录、登录授权和通知记录都会从数据库移除，无法恢复。
          </Text>
          <Text size="xs" c="red.4">
            为避免误操作，当前登录的管理员账户不能被彻底删除。
          </Text>
        </Stack>
      ),
      labels: { confirm: '彻底删除', cancel: '取消' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        setDeletingUserId(user.id)
        setError(null)
        try {
          await adminUserService.deleteUserPermanently(user.id)
          await loadUsers()
        } catch (err) {
          console.error('Failed to delete user:', err)
          const message = err && typeof err === 'object' && 'message' in err
            ? String((err as { message?: unknown }).message)
            : '彻底删除用户失败'
          setError(message)
        } finally {
          setDeletingUserId(null)
        }
      },
    })
  }

  const handleOperationSuccess = () => {
    loadUsers()
    setShowTokenModal(false)
    setShowStatusModal(false)
    setShowRoleModal(false)
    setSelectedUser(null)
  }

  const hasActiveFilters = Boolean(
    search || isActiveFilter !== undefined || isAdminFilter !== undefined || isVerifiedFilter !== undefined
  )

  const formatFilterValue = (value: boolean | undefined) =>
    value === undefined ? null : String(value)

  return (
    <AppPageShell py="xl" gap="lg">
        <Group align="flex-start" wrap="nowrap">
          <AdminBackButton />
          <Stack gap={4}>
            <Title order={1}>用户管理</Title>
            <Text c="dimmed">管理用户账户和权限</Text>
          </Stack>
        </Group>

        <Paper p="lg" radius="xl" withBorder>
          <Stack gap="md">
            <Group grow align="end">
              <TextInput
                label="搜索用户"
                placeholder="搜索用户名或邮箱..."
                value={search}
                onChange={(event) => {
                  setSearch(event.currentTarget.value)
                  setPage(1)
                }}
                leftSection={<MagnifyingGlassIcon width={16} height={16} />}
              />
              <Select
                label="激活状态"
                placeholder="全部状态"
                clearable
                value={formatFilterValue(isActiveFilter)}
                onChange={(value) => {
                  setIsActiveFilter(value === null ? undefined : value === 'true')
                  setPage(1)
                }}
                data={booleanFilterOptions.active}
              />
              <Select
                label="用户权限"
                placeholder="全部权限"
                clearable
                value={formatFilterValue(isAdminFilter)}
                onChange={(value) => {
                  setIsAdminFilter(value === null ? undefined : value === 'true')
                  setPage(1)
                }}
                data={booleanFilterOptions.admin}
              />
              <Select
                label="验证状态"
                placeholder="全部验证"
                clearable
                value={formatFilterValue(isVerifiedFilter)}
                onChange={(value) => {
                  setIsVerifiedFilter(value === null ? undefined : value === 'true')
                  setPage(1)
                }}
                data={booleanFilterOptions.verified}
              />
            </Group>

            {hasActiveFilters && (
              <Group justify="flex-start">
                <Button
                  variant="light"
                  color="gray"
                  leftSection={<XMarkIcon width={16} height={16} />}
                  onClick={handleResetSearch}
                >
                  重置筛选
                </Button>
              </Group>
            )}
          </Stack>
        </Paper>

        {error && (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        )}

        <Text size="sm" c="dimmed">
          共找到 {total} 个用户，当前第 {page}/{Math.max(totalPages, 1)} 页
        </Text>

        <Paper radius="xl" withBorder>
          <ScrollArea>
            <Table highlightOnHover verticalSpacing="md" horizontalSpacing="md" miw={960}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>用户信息</Table.Th>
                  {sortableColumns.map((column) => (
                    <Table.Th key={column.field}>
                      <UnstyledButton onClick={() => handleSort(column.field)}>
                        <Group gap={4} wrap="nowrap">
                          <Text size="sm" fw={500}>
                            {column.label}
                          </Text>
                          <Text size="sm" c={orderBy === column.field ? 'brand' : 'dimmed'}>
                            {orderBy === column.field ? (order === 'asc' ? '↑' : '↓') : '↕'}
                          </Text>
                        </Group>
                      </UnstyledButton>
                    </Table.Th>
                  ))}
                  <Table.Th>Credits 余额</Table.Th>
                  <Table.Th>状态</Table.Th>
                  <Table.Th>
                    <Group justify="flex-end">
                      <Text size="sm" fw={500}>
                        操作
                      </Text>
                    </Group>
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {loading ? (
                  <Table.Tr>
                    <Table.Td colSpan={6}>
                      <Center py="xl">
                        <Stack align="center" gap="sm">
                          <Loader color="brand" />
                          <Text size="sm" c="dimmed">
                            加载中...
                          </Text>
                        </Stack>
                      </Center>
                    </Table.Td>
                  </Table.Tr>
                ) : users.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={6}>
                      <Center py="xl">
                        <Text c="dimmed">没有找到用户</Text>
                      </Center>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  users.map((user) => (
                    <Table.Tr key={user.id}>
                      <Table.Td>
                        <Group gap="sm" wrap="nowrap">
                          <Avatar src={user.avatar_url} radius="xl" color="brand">
                            {user.username[0]?.toUpperCase()}
                          </Avatar>
                          <Stack gap={0}>
                            <Text fw={600}>{user.display_name || user.username}</Text>
                            <Text size="sm" c="dimmed">
                              {user.email}
                            </Text>
                          </Stack>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">
                          {new Date(user.created_at).toLocaleDateString('zh-CN')}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">
                          {user.last_login_at
                            ? new Date(user.last_login_at).toLocaleDateString('zh-CN')
                            : '-'}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c={(user.remaining_credits ?? user.remaining_tokens ?? 0) > 0 ? 'brand' : 'dimmed'} fw={600}>
                          {(user.remaining_credits ?? user.remaining_tokens ?? 0).toLocaleString()}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          <Badge color={user.is_active ? 'green' : 'red'} variant="light">
                            {user.is_active ? '正常' : '已封禁'}
                          </Badge>
                          {user.is_admin && (
                            <Badge color="violet" variant="light">
                              管理员
                            </Badge>
                          )}
                          {user.is_verified && (
                            <Badge color="blue" variant="light">
                              已验证
                            </Badge>
                          )}
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Group justify="flex-end" gap="xs" wrap="nowrap">
                          <ActionIcon
                            variant="light"
                            color="gray"
                            aria-label="查看详情"
                            onClick={() => handleViewDetail(user)}
                          >
                            <PencilIcon width={16} height={16} />
                          </ActionIcon>
                          <ActionIcon
                            variant="light"
                            color="brand"
                            aria-label="调整 Credits"
                            onClick={() => handleAdjustToken(user)}
                          >
                            <BanknotesIcon width={16} height={16} />
                          </ActionIcon>
                          <ActionIcon
                            variant="light"
                            color="yellow"
                            aria-label={user.is_active ? '封禁用户' : '解封用户'}
                            onClick={() => handleUpdateStatus(user)}
                          >
                            <NoSymbolIcon width={16} height={16} />
                          </ActionIcon>
                          <ActionIcon
                            variant="light"
                            color="violet"
                            aria-label={user.is_admin ? '取消管理员' : '设为管理员'}
                            onClick={() => handleUpdateRole(user)}
                          >
                            <ShieldCheckIcon width={16} height={16} />
                          </ActionIcon>
                          <ActionIcon
                            variant="light"
                            color="red"
                            aria-label={`彻底删除用户 ${user.display_name || user.username}`}
                            disabled={deletingUserId === user.id}
                            onClick={() => handleDeleteUser(user)}
                          >
                            <TrashIcon width={16} height={16} />
                          </ActionIcon>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))
                )}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Paper>

        {totalPages > 1 && (
          <Pagination
            current={page}
            pageSize={perPage}
            total={total}
            totalPages={totalPages}
            onChange={setPage}
            onSizeChange={(size) => {
              setPerPage(size)
              setPage(1)
            }}
            showSizeChanger
          />
        )}
      

      {showDetailModal && (
        <UserDetailModal
          detail={userDetail}
          loading={detailLoading}
          onClose={() => {
            setShowDetailModal(false)
            setSelectedUser(null)
            setUserDetail(null)
          }}
        />
      )}

      {showTokenModal && selectedUser && (
        <TokenAdjustmentModal
          user={selectedUser}
          onSuccess={handleOperationSuccess}
          onClose={() => {
            setShowTokenModal(false)
            setSelectedUser(null)
          }}
        />
      )}

      {showStatusModal && selectedUser && (
        <StatusUpdateModal
          user={selectedUser}
          onSuccess={handleOperationSuccess}
          onClose={() => {
            setShowStatusModal(false)
            setSelectedUser(null)
          }}
        />
      )}

      {showRoleModal && selectedUser && (
        <RoleUpdateModal
          user={selectedUser}
          onSuccess={handleOperationSuccess}
          onClose={() => {
            setShowRoleModal(false)
            setSelectedUser(null)
          }}
        />
      )}
    </AppPageShell>
  )
}

export default UserManagementPage
