export interface AudioGenerationStatus {
  status: 'idle' | 'generating' | 'uploading' | 'completed' | 'failed'
  progress?: number
  error?: string
}