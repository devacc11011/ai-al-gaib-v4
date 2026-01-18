interface SettingsShape {
  activeAgent: 'mock' | 'claude-code' | 'codex' | 'gemini-cli'
  activeProjectId?: string
  workspacePath?: string
  planner?: {
    agent: 'mock' | 'claude-code' | 'codex' | 'gemini-cli'
    model?: string
  }
  executor?: {
    agent: 'mock' | 'claude-code' | 'codex' | 'gemini-cli'
    model?: string
  }
  claude?: {
    model?: string
    permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions'
    allowedTools?: string[]
    maxTurns?: number
    additionalDirectories?: string[]
    settingSources?: Array<'user' | 'project' | 'local'>
  }
  codex?: {
    model?: string
    threadId?: string
  }
  gemini?: {
    model?: string
    outputFormat?: 'stream-json' | 'json' | 'jsonl'
  }
}
