import { promises as fs } from 'fs'
import { dirname, join } from 'path'
import { Settings } from './Settings'

const DEFAULT_SETTINGS: Settings = {
  activeAgent: 'mock',
  activeProjectId: '',
  workspacePath: '',
  planner: {
    agent: 'mock'
  },
  executor: {
    agent: 'mock'
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
      return {
        ...DEFAULT_SETTINGS,
        ...parsed
      }
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
      planner: { ...current.planner, ...partial.planner },
      executor: { ...current.executor, ...partial.executor },
      claude: { ...current.claude, ...partial.claude },
      codex: { ...current.codex, ...partial.codex },
      gemini: { ...current.gemini, ...partial.gemini }
    }
    await this.save(next)
    return next
  }
}
