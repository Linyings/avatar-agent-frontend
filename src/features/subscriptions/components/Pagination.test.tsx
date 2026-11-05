import { MantineProvider } from '@mantine/core'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Pagination from './Pagination'

function renderPagination(ui: React.ReactElement) {
  return render(
    <MantineProvider>
      {ui}
    </MantineProvider>
  )
}

describe('Pagination', () => {
  it('在点击页码和切换每页数量时触发回调', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const onSizeChange = vi.fn()

    renderPagination(
      <Pagination
        current={3}
        pageSize={20}
        total={240}
        totalPages={12}
        onChange={onChange}
        onSizeChange={onSizeChange}
        showQuickJumper
        showSizeChanger
      />
    )

    expect(
      screen.getByText((_, node) => node?.textContent === '共 240 条记录')
    ).toBeInTheDocument()
    expect(screen.getByText('240')).not.toHaveStyle({ color: 'white' })

    await user.click(screen.getByRole('button', { name: '5' }))
    expect(onChange).toHaveBeenCalledWith(5)

    await user.selectOptions(screen.getByRole('combobox'), '50')
    expect(onSizeChange).toHaveBeenCalledWith(50)

    const quickJumpInput = screen.getByRole('textbox', { name: '跳转页码' })
    await user.clear(quickJumpInput)
    await user.type(quickJumpInput, '8{Enter}')
    expect(onChange).toHaveBeenCalledWith(8)
  })

  it('只有一页时不渲染分页控件', () => {
    const { container } = renderPagination(
      <Pagination
        current={1}
        pageSize={20}
        total={8}
        totalPages={1}
        onChange={vi.fn()}
      />
    )

    expect(container.querySelector('button')).toBeNull()
  })
})
