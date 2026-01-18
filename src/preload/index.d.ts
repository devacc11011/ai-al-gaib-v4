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
    usage: {
      get: () => Promise<UsageSummary | null>
      reset: () => Promise<UsageSummary | null>
    }
  }

  interface Window {
    electron: ElectronAPI
    api: AppApi
  }
}

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
  usagePricing?: {
    claude?: UsagePricing
    openai?: UsagePricing
    gemini?: UsagePricing
  }
}

interface UsagePricing {
  inputPerMillionUsd?: number
  outputPerMillionUsd?: number
}

interface SecretsShape {
  anthropicApiKey?: string
  openaiApiKey?: string
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

type UsageProviderKey = 'claude' | 'openai' | 'gemini' | 'other'

interface UsageStats {
  tasks: number
  inputChars: number
  outputChars: number
  durationMs: number
}

interface UsageSummary {
  providers: Record<UsageProviderKey, UsageStats>
  lastUpdated: string | null
}
