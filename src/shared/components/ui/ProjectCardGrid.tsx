import React, { useState } from 'react'
import { Box, Card, Group, SimpleGrid, Skeleton, Stack } from '@mantine/core'
import ProjectCard from './ProjectCard'
import ConfirmDialog from './ConfirmDialog'
import type { Project } from '@/features/projects'

interface ProjectCardGridProps {
  projects: Project[]
  isLoading?: boolean
  onDeleteProject?: (projectId: string) => void | Promise<void>
}

const ProjectCardGrid: React.FC<ProjectCardGridProps> = ({
  projects,
  isLoading,
  onDeleteProject,
}) => {
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleRequestDelete = (projectId: string) => {
    setDeleteConfirmId(projectId)
  }

  const handleConfirmDelete = async () => {
    if (deleteConfirmId && onDeleteProject) {
      setDeletingId(deleteConfirmId)
      try {
        await onDeleteProject(deleteConfirmId)
      } finally {
        setDeletingId(null)
        setDeleteConfirmId(null)
      }
    }
  }

  if (isLoading) {
    return (
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 4, xl: 5 }} mt="xl" spacing="md">
        {Array.from({ length: 10 }).map((_, index) => (
          <Card
            key={index}
            padding={0}
            radius="xl"
            style={{
              overflow: 'hidden',
              background: 'var(--app-surface)',
              border: '1px solid var(--app-border)',
              boxShadow: 'var(--app-shadow)',
            }}
            withBorder
          >
            <Skeleton height={142} radius={0} />

            <Stack gap="sm" p="sm">
              <Skeleton height={22} radius="sm" width="72%" />

              <Stack gap="xs">
                <Skeleton height={14} radius="sm" />
                <Skeleton height={14} radius="sm" width="66%" />
              </Stack>

              <Group gap="xs">
                <Skeleton height={20} radius="xl" width={56} />
                <Skeleton height={20} radius="xl" width={72} />
              </Group>

              <Group gap="xs">
                <Skeleton height={12} radius="xl" width={96} />
                <Box c="dimmed">·</Box>
                <Skeleton height={12} radius="xl" width={72} />
              </Group>

              <Group justify="space-between">
                <Skeleton height={16} radius="sm" width={72} />
                <Skeleton height={16} radius="sm" width={52} />
              </Group>
            </Stack>
          </Card>
        ))}
      </SimpleGrid>
    )
  }

  return (
    <>
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 4, xl: 5 }} mt="xl" spacing="md">
        {projects.map((project) => (
          <ProjectCard
            key={project.id}
            isDeleting={deletingId === project.id}
            onDeleteProject={handleRequestDelete}
            project={project}
          />
        ))}
      </SimpleGrid>

      <ConfirmDialog
        cancelText="取消"
        confirmText={deletingId !== null ? '删除中...' : '删除'}
        isOpen={!!deleteConfirmId}
        message="确定要删除这个项目吗？此操作无法撤销。"
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={handleConfirmDelete}
        title="删除项目"
        type="danger"
      />
    </>
  )
}

export default ProjectCardGrid
