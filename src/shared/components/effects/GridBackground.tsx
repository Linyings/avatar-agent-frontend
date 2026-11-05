import * as React from 'react'
import { joinClasses } from '@/lib/utils'

export interface GridBackgroundProps {
  className?: string
}

const GridBackground = React.forwardRef<HTMLDivElement, GridBackgroundProps>(
  ({ className }, ref) => {
    return (
      <div
        ref={ref}
        aria-hidden="true"
        className={joinClasses(
          'pointer-events-none absolute inset-0',
          className
        )}
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(91, 148, 255, 0.03) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(91, 148, 255, 0.03) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
          maskImage: 'radial-gradient(ellipse at center, black 40%, transparent 80%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 40%, transparent 80%)',
        }}
      />
    )
  }
)

GridBackground.displayName = 'GridBackground'

export default GridBackground
