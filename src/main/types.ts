export type AgentType = 'mock' | 'claude-code' | 'codex' | 'gemini-cli'

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface Task {
  id: string
  title: string
  agent: AgentType
  status: TaskStatus
  dependencies: string[]
  workspace: string
  description: string
  inputContext: string[]
  expectedOutput: string[]
}

export interface TaskResult {
  id: string
  status: TaskStatus
  durationMs: number
  agent: AgentType
  filesModified: string[]
  summary: string
  handoffNotes: string[]
  errors: string[]
}

export interface Plan {
  id: string
  createdAt: string
  tasks: Task[]
}

export type OrchestratorEventType =
  | 'plan:created'
  | 'task:started'
  | 'task:completed'
  | 'run:completed'
  | 'run:failed'

export interface OrchestratorEvent<T = unknown> {
  type: OrchestratorEventType
  timestamp: string
  data: T
}
