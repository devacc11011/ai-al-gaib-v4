interface SettingsShape {
  activeAgent: 'claude-code' | 'codex' | 'gemini-cli'
  activeProjectId?: string
  workspacePath?: string
  planner?: {
    agent: 'claude-code' | 'codex' | 'gemini-cli'
    model?: string
  }
  executor?: {
    agent: 'claude-code' | 'codex' | 'gemini-cli'
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
