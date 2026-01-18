import { AgentType } from '../types'

export interface ClaudeSettings {
  model?: string
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions'
  allowedTools?: string[]
  maxTurns?: number
  additionalDirectories?: string[]
  settingSources?: Array<'user' | 'project' | 'local'>
}

export interface CodexSettings {
  model?: string
  threadId?: string
}

export interface GeminiSettings {
  model?: string
  outputFormat?: 'stream-json' | 'json' | 'jsonl'
}

export interface Settings {
  activeAgent: AgentType
  claude?: ClaudeSettings
  codex?: CodexSettings
  gemini?: GeminiSettings
}
