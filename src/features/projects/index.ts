// 项目管理功能模块统一导出
export { useProject, ProjectProvider } from './contexts/ProjectContext'
export { default as ProjectService } from './services/projectService'

// 导出所有类型
export type {
  Project,
  ProjectStatus,
  ProjectStage,
  StageStatus,
  FileType,
  ProjectQueryParams
} from './types/project'
