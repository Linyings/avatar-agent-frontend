import React, { useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Center,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { PlusIcon } from '@/shared/icons/tabler'
import AppPageShell from '@/shared/components/ui/AppPageShell'
import AdminBackButton from '@/shared/components/ui/AdminBackButton'
import { tokenPackageService } from '@/features/subscriptions'
import { PackageCard } from '@/features/subscriptions/components/admin/PackageCard'
import { PackageFormModal, type PackageFormData } from '@/features/subscriptions/components/admin/PackageFormModal'
import type { TokenPackage } from '@/features/subscriptions/types'

const CreditPackagesPage: React.FC = () => {
  const [packages, setPackages] = useState<TokenPackage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [selectedPackage, setSelectedPackage] = useState<TokenPackage | null>(null)

  const loadPackages = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const response = await tokenPackageService.listAdminPackages()
      setPackages(response.packages)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载套餐列表失败')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadPackages()
  }, [])

  const handleToggleActive = async (pkg: TokenPackage) => {
    if (pkg.is_deleted) return
    try {
      await tokenPackageService.updatePackage(pkg.id, { is_active: !pkg.is_active })
      await loadPackages()
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败')
    }
  }

  const handleCreate = () => {
    setModalMode('create')
    setSelectedPackage(null)
    setIsModalOpen(true)
  }

  const handleEdit = (pkg: TokenPackage) => {
    if (pkg.is_deleted) return
    setModalMode('edit')
    setSelectedPackage(pkg)
    setIsModalOpen(true)
  }

  const handleSubmit = async (data: PackageFormData) => {
    if (modalMode === 'create') {
      await tokenPackageService.createPackage(data)
    } else if (selectedPackage) {
      await tokenPackageService.updatePackage(selectedPackage.id, data)
    }
    await loadPackages()
    setIsModalOpen(false)
  }

  const handleDelete = async (pkg: TokenPackage) => {
    modals.openConfirmModal({
      title: '删除 Credits 套餐',
      centered: true,
      children: <Text size="sm">确定要删除套餐“{pkg.display_name}”吗？该套餐会从售卖列表移除，历史记录仍会保留。</Text>,
      labels: { confirm: '确认删除', cancel: '取消' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await tokenPackageService.deletePackage(pkg.id)
          await loadPackages()
        } catch (err) {
          setError(err instanceof Error ? err.message : '删除失败')
        }
      },
    })
  }

  const handleHardDelete = async (pkg: TokenPackage) => {
    modals.openConfirmModal({
      title: '永久删除 Credits 套餐',
      centered: true,
      children: <Text size="sm">确定要永久删除套餐“{pkg.display_name}”吗？此操作会移除数据库记录，无法恢复。</Text>,
      labels: { confirm: '永久删除', cancel: '取消' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await tokenPackageService.deletePackage(pkg.id, { hard: true })
          await loadPackages()
        } catch (err) {
          setError(err instanceof Error ? err.message : '永久删除失败')
        }
      },
    })
  }

  return (
    <AppPageShell py="xl" gap="lg">
      <Group justify="space-between" align="flex-start">
        <Group align="flex-start" wrap="nowrap">
          <AdminBackButton />
          <Stack gap={4}>
            <Title order={1}>Credits 套餐管理</Title>
            <Text c="dimmed">管理一次性 Credits 充值套餐及其人民币定价。</Text>
          </Stack>
        </Group>
        <Button onClick={handleCreate} leftSection={<PlusIcon width={18} height={18} />}>
          创建套餐
        </Button>
      </Group>

      {error && <Alert color="red" variant="light">{error}</Alert>}

      {isLoading ? (
        <Center py="xl">
          <Loader color="brand" />
        </Center>
      ) : packages.length === 0 && !error ? (
        <Center py="xl">
          <Stack align="center" gap="sm">
            <Text size="lg">暂无 Credits 套餐</Text>
            <Text c="dimmed">创建第一个套餐开始配置充值策略。</Text>
            <Button onClick={handleCreate} variant="default">
              创建第一个套餐
            </Button>
          </Stack>
        </Center>
      ) : (
        <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="lg">
          {packages.map((pkg) => (
            <PackageCard
              key={pkg.id}
              package={pkg}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onHardDelete={handleHardDelete}
              onToggleActive={handleToggleActive}
            />
          ))}
        </SimpleGrid>
      )}

      <PackageFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSubmit}
        initialData={selectedPackage}
        mode={modalMode}
      />
    </AppPageShell>
  )
}

export default CreditPackagesPage
