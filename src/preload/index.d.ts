import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface OrchestratorEventPayload {
    type: string
    timestamp: string
    data: unknown
  }

  interface OrchestratorApi {
    run: (prompt: string) => Promise<{ planId: string; summary: string }>
    openStreamWindow: () => Promise<boolean>
    onEvent: (callback: (event: OrchestratorEventPayload) => void) => () => void
  }

  interface AppApi {
    orchestrator: OrchestratorApi
    settings: {
      get: () => Promise<SettingsShape>
      update: (partial: Partial<SettingsShape>) => Promise<SettingsShape>
    }
    workspace: {
      pick: () => Promise<string | null>
      listFiles: (depth?: number) => Promise<WorkspaceEntryShape[]>
      readFile: (path: string) => Promise<string>
    }
    projects: {
      list: () => Promise<ProjectShape[]>
      create: (payload: { name: string; workspacePath: string }) => Promise<ProjectShape | null>
      select: (projectId: string) => Promise<SettingsShape>
    }
    tools: {
      respond: (payload: { id: string; allow: boolean }) => Promise<boolean>
    }
    menu: {
      onAction: (callback: (payload: { type: string }) => void) => () => void
    }
    secrets: {
      get: () => Promise<SecretsShape>
      update: (partial: Partial<SecretsShape>) => Promise<SecretsShape>
    }
  }

  interface Window {
    electron: ElectronAPI
    api: AppApi
  }
}

interface SettingsShape {
  activeAgent: 'mock' | 'claude-code' | 'codex' | 'gemini-cli'
  activeProjectId?: string
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

interface SecretsShape {
  anthropicApiKey?: string
  openaiApiKey?: string
  geminiApiKey?: string
}

interface ProjectShape {
  id: string
  name: string
  workspacePath: string
  createdAt: string
  updatedAt: string
}

interface WorkspaceEntryShape {
  type: 'file' | 'dir'
  path: string
  name: string
}
