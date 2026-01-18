import { promises as fs } from 'fs'
import { dirname, join } from 'path'
import { Settings } from './Settings'

const DEFAULT_SETTINGS: Settings = {
  activeAgent: 'claude-code',
  activeProjectId: '',
  workspacePath: '',
  planner: {
    agent: 'claude-code'
  },
  executor: {
    agent: 'claude-code'
  },
  claude: {
    permissionMode: 'acceptEdits',
    maxTurns: 10,
    allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
    settingSources: ['project']
  },
  codex: {},
  gemini: {
    outputFormat: 'stream-json'
  }
}

export class SettingsStore {
  constructor(private baseDir: string) {}

  private settingsPath(): string {
    return join(this.baseDir, 'settings.json')
  }

  async load(): Promise<Settings> {
    try {
      const data = await fs.readFile(this.settingsPath(), 'utf-8')
      const parsed = JSON.parse(data) as Settings
      const merged: Settings = {
        ...DEFAULT_SETTINGS,
        ...parsed
      }
      if (merged.activeAgent === 'mock') merged.activeAgent = 'claude-code'
      if (merged.planner?.agent === 'mock') merged.planner.agent = 'claude-code'
      if (merged.executor?.agent === 'mock') merged.executor.agent = 'claude-code'
      return merged
    } catch {
      await this.save(DEFAULT_SETTINGS)
      return DEFAULT_SETTINGS
    }
  }

  async save(settings: Settings): Promise<void> {
    await fs.mkdir(dirname(this.settingsPath()), { recursive: true })
    await fs.writeFile(this.settingsPath(), JSON.stringify(settings, null, 2), 'utf-8')
  }

  async update(partial: Partial<Settings>): Promise<Settings> {
    const current = await this.load()
    const next: Settings = {
      ...current,
      ...partial,
      planner: {
        agent: partial.planner?.agent ?? current.planner?.agent ?? 'claude-code',
        model: partial.planner?.model ?? current.planner?.model
      },
      executor: {
        agent: partial.executor?.agent ?? current.executor?.agent ?? 'claude-code',
        model: partial.executor?.model ?? current.executor?.model
      },
      claude: { ...current.claude, ...partial.claude },
      codex: { ...current.codex, ...partial.codex },
      gemini: { ...current.gemini, ...partial.gemini }
    }
    await this.save(next)
    return next
  }
}
