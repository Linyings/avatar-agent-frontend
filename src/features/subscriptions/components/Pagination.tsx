import React from 'react'
import {
  ActionIcon,
  Button,
  Group,
  NativeSelect,
  NumberInput,
  Pagination as MantinePagination,
  Stack,
  Text,
} from '@mantine/core'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
} from '@/shared/icons/tabler'

export interface PaginationProps {
  current: number
  pageSize: number
  total: number
  totalPages: number
  onChange: (page: number) => void
  showQuickJumper?: boolean
  showSizeChanger?: boolean
  onSizeChange?: (size: number) => void
  pageSizeOptions?: number[]
}

const Pagination: React.FC<PaginationProps> = ({
  current,
  pageSize,
  total,
  totalPages,
  onChange,
  showQuickJumper = false,
  showSizeChanger = false,
  onSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
}) => {
  const [jumpPage, setJumpPage] = React.useState<string | number>('')

  const handleJumpToPage = () => {
    const pageNum = Number(jumpPage)
    if (pageNum >= 1 && pageNum <= totalPages) {
      onChange(pageNum)
      setJumpPage('')
    }
  }

  if (totalPages <= 1) {
    return null
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center" wrap="wrap" gap="md">
        <Text size="sm" c="dimmed">
          共 <Text span fw={700} c="inherit">{total}</Text> 条记录
        </Text>

        <Group align="center" gap="xs" wrap="wrap">
          <ActionIcon
            variant="default"
            aria-label="首页"
            onClick={() => onChange(1)}
            disabled={current === 1}
          >
            <ChevronDoubleLeftIcon className="h-4 w-4" />
          </ActionIcon>
          <ActionIcon
            variant="default"
            aria-label="上一页"
            onClick={() => onChange(current - 1)}
            disabled={current === 1}
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </ActionIcon>

          <MantinePagination
            value={current}
            onChange={onChange}
            total={totalPages}
            siblings={1}
            boundaries={1}
          />

          <ActionIcon
            variant="default"
            aria-label="下一页"
            onClick={() => onChange(current + 1)}
            disabled={current === totalPages}
          >
            <ChevronRightIcon className="h-4 w-4" />
          </ActionIcon>
          <ActionIcon
            variant="default"
            aria-label="末页"
            onClick={() => onChange(totalPages)}
            disabled={current === totalPages}
          >
            <ChevronDoubleRightIcon className="h-4 w-4" />
          </ActionIcon>
        </Group>

        <Group align="end" gap="sm" wrap="wrap">
          {showSizeChanger && onSizeChange && (
            <NativeSelect
              label="每页条数"
              value={String(pageSize)}
              onChange={(event) => onSizeChange(Number(event.currentTarget.value))}
              data={pageSizeOptions.map((size) => ({ value: String(size), label: `${size} 条` }))}
            />
          )}

          {showQuickJumper && (
            <Group align="end" gap="sm" wrap="nowrap">
              <NumberInput
                label="跳转页码"
                min={1}
                max={totalPages}
                value={jumpPage}
                onChange={setJumpPage}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    handleJumpToPage()
                  }
                }}
                clampBehavior="strict"
                allowDecimal={false}
                hideControls
                w={120}
              />
              <Button variant="light" onClick={handleJumpToPage}>
                跳转
              </Button>
            </Group>
          )}
        </Group>
      </Group>
    </Stack>
  )
}

export default Pagination
