import { ProjectProvider } from '@/features/projects'
import AppRoutes from '@/routes'


function App() {
  return (
    <ProjectProvider>
      <AppRoutes />
    </ProjectProvider>
  )
}

export default App
