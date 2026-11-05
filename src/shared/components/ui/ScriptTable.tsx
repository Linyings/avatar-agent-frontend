import React, { useState, useCallback, useEffect, useRef } from 'react'
import { ActionIcon, Box, Button, Checkbox, Paper, ScrollArea, Table, Text, TextInput, Textarea } from '@mantine/core'
import {
  PlusIcon,
  TrashIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  DocumentDuplicateIcon
} from '@/shared/icons/tabler'
import type { ScriptItem } from '../../types'

interface ScriptTableProps {
  data: ScriptItem[]
  onChange: (newData: ScriptItem[]) => void
  className?: string
}

interface EditingCell {
  rowId: number
  field: keyof ScriptItem
}

const ScriptTable: React.FC<ScriptTableProps> = ({
  data = [],
  onChange,
  className = ''
}) => {
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())
  const editInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  // 自动聚焦编辑输入框
  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingCell])

  // 开始编辑单元格
  const startEditing = useCallback((rowId: number, field: keyof ScriptItem) => {
    const item = data.find(item => item._id === rowId)
    if (item) {
      setEditingCell({ rowId, field })
      setEditValue(String(item[field] || ''))
    }
  }, [data])

  // 保存编辑
  const saveEdit = useCallback(() => {
    if (!editingCell) return

    const newData = data.map(item => {
      if (item._id !== editingCell.rowId) return item

      // 对于数字字段进行转换
      let value: any = editValue
      if (editingCell.field === 'start' || editingCell.field === 'end') {
        value = Number(editValue)
      }

      return { ...item, [editingCell.field]: value }
    })

    onChange(newData)
    setEditingCell(null)
    setEditValue('')
  }, [editingCell, editValue, data, onChange])

  // 取消编辑
  const cancelEdit = useCallback(() => {
    setEditingCell(null)
    setEditValue('')
  }, [])

  // 处理键盘事件
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!editingCell) return

    switch (e.key) {
      case 'Enter':
        e.preventDefault()
        saveEdit()
        break
      case 'Escape':
        e.preventDefault()
        cancelEdit()
        break
      case 'Tab':
        e.preventDefault()
        saveEdit()
        // TODO: 移动到下一个单元格
        break
    }
  }, [editingCell, saveEdit, cancelEdit])

  // 添加新行
  const addNewRow = useCallback(() => {
    const newId = Math.max(0, ...data.map(item => item._id)) + 1
    const newItem: ScriptItem = {
      _id: newId,
      text: '新解说词',
      start: 0,
      end: 5,
      org: ''
    }
    onChange([...data, newItem])
  }, [data, onChange])

  // 删除行
  const deleteRow = useCallback((rowId: number) => {
    const newData = data.filter(item => item._id !== rowId)
    onChange(newData)
    setSelectedRows(prev => {
      const next = new Set(prev)
      next.delete(rowId)
      return next
    })
  }, [data, onChange])

  // 删除选中的行
  const deleteSelectedRows = useCallback(() => {
    if (selectedRows.size === 0) return
    const newData = data.filter(item => !selectedRows.has(item._id))
    onChange(newData)
    setSelectedRows(new Set())
  }, [data, onChange, selectedRows])

  // 上移行
  const moveRowUp = useCallback((index: number) => {
    if (index === 0) return
    const newData = [...data]
    const temp = newData[index - 1]
    newData[index - 1] = newData[index]
    newData[index] = temp
    onChange(newData)
  }, [data, onChange])

  // 下移行
  const moveRowDown = useCallback((index: number) => {
    if (index === data.length - 1) return
    const newData = [...data]
    const temp = newData[index + 1]
    newData[index + 1] = newData[index]
    newData[index] = temp
    onChange(newData)
  }, [data, onChange])

  // 复制行
  const duplicateRow = useCallback((rowId: number) => {
    const item = data.find(item => item._id === rowId)
    if (!item) return

    const newId = Math.max(0, ...data.map(item => item._id)) + 1
    const newItem: ScriptItem = {
      ...item,
      _id: newId
    }

    const index = data.findIndex(item => item._id === rowId)
    const newData = [...data]
    newData.splice(index + 1, 0, newItem)
    onChange(newData)
  }, [data, onChange])

  // 渲染编辑器
  const renderEditor = (item: ScriptItem, field: keyof ScriptItem) => {
    if (editingCell?.rowId !== item._id || editingCell?.field !== field) {
      return null
    }

    const commonProps = {
      ref: editInputRef as any,
      value: editValue,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setEditValue(e.target.value),
      onKeyDown: handleKeyDown,
      onBlur: saveEdit,
    }

    // 文本区域字段
    if (field === 'org' || field === 'text') {
      return (
        <Textarea
          {...commonProps}
          rows={2}
          autosize
          minRows={2}
          styles={{
            input: {
              background: 'var(--app-input-bg)',
              color: 'var(--app-text)',
              borderColor: 'var(--app-brand-soft-border-strong)',
            },
          }}
        />
      )
    }

    // 数字字段（开始时间、结束时间）
    return (
      <TextInput
        {...commonProps}
        type={(field === 'start' || field === 'end') ? 'number' : 'text'}
        step={(field === 'start' || field === 'end') ? '0.001' : undefined}
        styles={{
          input: {
            background: 'var(--app-input-bg)',
            color: 'var(--app-text)',
            borderColor: 'var(--app-brand-soft-border-strong)',
          },
        }}
      />
    )
  }

  // 渲染单元格内容
  const renderCellContent = (item: ScriptItem, field: keyof ScriptItem) => {
    if (editingCell?.rowId === item._id && editingCell?.field === field) {
      return renderEditor(item, field)
    }

    const value = item[field]

    // 格式化显示值
    let displayValue = ''
    if (field === 'start' || field === 'end') {
      displayValue = value ? String(Number(value).toFixed(2)) + 's' : '0.00s'
    } else {
      displayValue = String(value || '')
    }

    return (
      <Box
        style={{
          minHeight: 40,
          display: 'flex',
          alignItems: 'center',
          padding: '4px 8px',
          cursor: 'pointer',
          borderRadius: 8,
          transition: 'background-color 160ms ease',
        }}
        onMouseEnter={(event) => {
          event.currentTarget.style.backgroundColor = 'var(--app-brand-soft-bg)'
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.backgroundColor = 'transparent'
        }}
        onClick={() => startEditing(item._id, field)}
        title="点击编辑"
      >
        {field === 'org' || field === 'text' ? (
          <Text size="sm" style={{ lineHeight: 1.6 }}>{displayValue}</Text>
        ) : (
          <Text size="sm">{displayValue}</Text>
        )}
      </Box>
    )
  }

  return (
    <Paper
      className={className}
      p="xl"
      radius="xl"
      withBorder
      style={{
        background: 'var(--app-surface)',
        borderColor: 'var(--app-border)',
        color: 'var(--app-text)',
      }}
    >
      <Box style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <Box style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Text fw={700} size="xl">剪辑脚本</Text>
          <Text size="sm" c="var(--app-muted)">共 {data.length} 项</Text>
        </Box>

        <Box style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button
            variant="subtle"
            color="brand"
            size="sm"
            onClick={addNewRow}
            leftSection={<PlusIcon style={{ width: 16, height: 16 }} />}
          >
            添加
          </Button>

          {selectedRows.size > 0 && (
            <Button
              variant="subtle"
              color="red"
              size="sm"
              onClick={deleteSelectedRows}
              leftSection={<TrashIcon style={{ width: 16, height: 16 }} />}
            >
              删除选中 ({selectedRows.size})
            </Button>
          )}
        </Box>
      </Box>

      <ScrollArea>
        <Table horizontalSpacing="md" verticalSpacing="sm" style={{ minWidth: 720 }}>
          <Table.Thead>
            <Table.Tr style={{ borderBottomColor: 'var(--app-border)' }}>
              <Table.Th style={{ width: 48 }}>
                <Checkbox
                  type="checkbox"
                  checked={selectedRows.size === data.length && data.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedRows(new Set(data.map(item => item._id)))
                    } else {
                      setSelectedRows(new Set())
                    }
                  }}
                />
              </Table.Th>
              <Table.Th style={{ width: 64, color: 'var(--app-text)' }}>序号</Table.Th>
              <Table.Th style={{ width: 112, color: 'var(--app-text)' }}>开始时间</Table.Th>
              <Table.Th style={{ width: 112, color: 'var(--app-text)' }}>结束时间</Table.Th>
              <Table.Th style={{ color: 'var(--app-text)' }}>原始字幕</Table.Th>
              <Table.Th style={{ color: 'var(--app-text)' }}>解说词</Table.Th>
              <Table.Th style={{ width: 136, color: 'var(--app-text)' }}>操作</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.map((item, index) => (
              <Table.Tr
                key={item._id}
                style={{
                  borderBottomColor: 'var(--app-border)',
                  background: selectedRows.has(item._id) ? 'var(--app-brand-soft-bg)' : undefined,
                }}
              >
                <Table.Td>
                  <Checkbox
                    checked={selectedRows.has(item._id)}
                    onChange={(e) => {
                      const newSelected = new Set(selectedRows)
                      if (e.target.checked) {
                        newSelected.add(item._id)
                      } else {
                        newSelected.delete(item._id)
                      }
                      setSelectedRows(newSelected)
                    }}
                  />
                </Table.Td>

                <Table.Td><Text size="sm" c="dimmed">{index + 1}</Text></Table.Td>

                <Table.Td>
                  {renderCellContent(item, 'start')}
                </Table.Td>

                <Table.Td>
                  {renderCellContent(item, 'end')}
                </Table.Td>

                <Table.Td style={{ maxWidth: 320 }}>
                  {renderCellContent(item, 'org')}
                </Table.Td>

                <Table.Td style={{ maxWidth: 320 }}>
                  {renderCellContent(item, 'text')}
                </Table.Td>

                <Table.Td>
                  <Box style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <ActionIcon
                      onClick={() => duplicateRow(item._id)}
                      variant="subtle"
                      color="gray"
                      title="复制行"
                    >
                      <DocumentDuplicateIcon style={{ width: 16, height: 16 }} />
                    </ActionIcon>

                    <ActionIcon
                      onClick={() => moveRowUp(index)}
                      disabled={index === 0}
                      variant="subtle"
                      color="gray"
                      title="上移"
                    >
                      <ArrowUpIcon style={{ width: 16, height: 16 }} />
                    </ActionIcon>

                    <ActionIcon
                      onClick={() => moveRowDown(index)}
                      disabled={index === data.length - 1}
                      variant="subtle"
                      color="gray"
                      title="下移"
                    >
                      <ArrowDownIcon style={{ width: 16, height: 16 }} />
                    </ActionIcon>

                    <ActionIcon
                      onClick={() => deleteRow(item._id)}
                      variant="subtle"
                      color="red"
                      title="删除"
                    >
                      <TrashIcon style={{ width: 16, height: 16 }} />
                    </ActionIcon>
                  </Box>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>

      {data.length === 0 && (
        <Box style={{ textAlign: 'center', paddingBlock: 48 }}>
          <Text c="dimmed" mb="md">还没有脚本数据</Text>
          <Button
            variant="outline"
            color="brand"
            onClick={addNewRow}
            leftSection={<PlusIcon style={{ width: 16, height: 16 }} />}
          >
            添加第一项
          </Button>
        </Box>
      )}
    </Paper>
  )
}

export default ScriptTable
