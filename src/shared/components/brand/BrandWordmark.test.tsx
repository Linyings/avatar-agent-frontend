import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { PRODUCT_NAME } from '@/shared/brand/identity'
import BrandWordmark from './BrandWordmark'

describe('BrandWordmark', () => {
  it('shows the digital-human product name', () => {
    render(
      <MantineProvider>
        <BrandWordmark />
      </MantineProvider>,
    )

    expect(screen.getByLabelText(PRODUCT_NAME)).toHaveTextContent('数字人口播')
    expect(screen.queryByText('Narrato')).not.toBeInTheDocument()
  })
})
