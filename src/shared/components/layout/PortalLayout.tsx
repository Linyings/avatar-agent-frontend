import { motion } from 'framer-motion'
import { Box } from '@mantine/core'
import PortalHeader from './PortalHeader'
import Footer from './Footer'
import { pageTransition } from '@/shared/utils/animations'

interface PortalLayoutProps {
  children: React.ReactNode
  showHeader?: boolean
}

export default function PortalLayout({ children, showHeader = true }: PortalLayoutProps) {
  return (
    <Box className="app-shell" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {showHeader && <PortalHeader />}
      <motion.main
        style={{ flex: 1 }}
        initial="initial"
        animate="animate"
        exit="exit"
        variants={pageTransition}
      >
        {children}
      </motion.main>
      <Footer />
    </Box>
  )
}
