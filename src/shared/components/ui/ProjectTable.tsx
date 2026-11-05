import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ActionIcon,
  Anchor,
  Group,
  Paper,
  ScrollArea,
  Skeleton,
  Stack,
  Table,
  Text,
} from '@mantine/core'
import { TrashIcon } from '@/shared/icons/tabler'
import type { Project } from '@/features/projects'
import StatusBadge from './StatusBadge'
import ConfirmDialog from './ConfirmDialog'

interface ProjectTableProps {
  projects: Project[]
  isLoading?: boolean
  onDeleteProject?: (projectId: string) => void
}

const ProjectTable: React.FC<ProjectTableProps> = ({ projects, isLoading, onDeleteProject }) => {
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
    } catch {
      return '-'
    }
  }

  const getActionText = (status: string) =>
    status === 'completed' || status === 'archived' ? 'View' : 'Edit'

  const handleDeleteClick = (projectId: string, event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
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
      <Paper withBorder radius="lg" p="md" mt="xl">
        <Stack gap="sm">
          {Array.from({ length: 5 }).map((_, index) => (
            <Group key={index} grow wrap="nowrap">
              <Skeleton height={18} radius="sm" />
              <Skeleton height={18} radius="sm" />
              <Skeleton height={18} radius="sm" visibleFrom="md" />
              <Skeleton height={18} radius="sm" />
              <Skeleton height={18} radius="sm" w={72} />
            </Group>
          ))}
        </Stack>
      </Paper>
    )
  }

  return (
    <>
      <Paper withBorder radius="lg" mt="xl" shadow="sm">
        <ScrollArea>
          <Table highlightOnHover verticalSpacing="md" horizontalSpacing="md">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Title</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th visibleFrom="md">Created</Table.Th>
                <Table.Th>Last Modified</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {projects.map((project) => (
                <Table.Tr key={project.id}>
                  <Table.Td>
                    <Anchor
                      component={Link}
                      to={`/projects/${project.id}`}
                      c="white"
                      underline="never"
                    >
                      <Text fw={600} truncate>{project.name}</Text>
                    </Anchor>
                  </Table.Td>
                  <Table.Td>
                    <StatusBadge status={project.status} size="sm" />
                  </Table.Td>
                  <Table.Td visibleFrom="md">
                    <Text size="sm" c="dimmed">{formatDate(project.created_at)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">{formatDate(project.updated_at)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Group justify="flex-end" gap="xs" wrap="nowrap">
                      <Anchor
                        component={Link}
                        to={`/projects/${project.id}`}
                        c="brand"
                        underline="hover"
                        size="sm"
                        fw={600}
                      >
                        {getActionText(project.status)}
                      </Anchor>
                      {onDeleteProject && (
                        <ActionIcon
                          variant="light"
                          color="red"
                          aria-label="删除项目"
                          title="Delete project"
                          onClick={(event) => handleDeleteClick(project.id, event)}
                          loading={deletingId === project.id}
                        >
                          <TrashIcon width={16} height={16} />
                        </ActionIcon>
                      )}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Paper>

      <ConfirmDialog
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={handleConfirmDelete}
        title="删除项目"
        message="确认要删除这个项目吗？该操作无法撤销。"
        confirmText={deletingId !== null ? '删除中...' : '删除'}
        cancelText="取消"
        type="danger"
      />
    </>
  )
}

export default ProjectTable
