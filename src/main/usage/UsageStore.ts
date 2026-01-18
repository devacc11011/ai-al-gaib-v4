import { promises as fs } from 'fs'
import { dirname, join } from 'path'
import { AgentType, Task, TaskResult } from '../types'

export type UsageProvider = 'claude' | 'openai' | 'gemini' | 'other'

export interface UsageStats {
  tasks: number
  inputChars: number
  outputChars: number
  durationMs: number
}

export interface UsageSummary {
  providers: Record<UsageProvider, UsageStats>
  lastUpdated: string | null
}

const emptyStats = (): UsageStats => ({
  tasks: 0,
  inputChars: 0,
  outputChars: 0,
  durationMs: 0
})

const emptySummary = (): UsageSummary => ({
  providers: {
    claude: emptyStats(),
    openai: emptyStats(),
    gemini: emptyStats(),
    other: emptyStats()
  },
  lastUpdated: null
})

export class UsageStore {
  constructor(private baseDir: string) {}

  async ensure(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true })
    await this.getSummary()
  }

  async getSummary(): Promise<UsageSummary> {
    try {
      const data = await fs.readFile(this.summaryPath(), 'utf-8')
      const parsed = JSON.parse(data) as UsageSummary
      const defaults = emptySummary()
      return {
        providers: { ...defaults.providers, ...parsed.providers },
        lastUpdated: parsed.lastUpdated ?? defaults.lastUpdated
      }
    } catch {
      const defaults = emptySummary()
      await this.save(defaults)
      return defaults
    }
  }

  async recordTask(task: Task, result: TaskResult): Promise<UsageSummary> {
    const provider = UsageStore.providerForAgent(task.agent)
    const inputChars = task.description?.length ?? 0
    const outputChars = result.summary?.length ?? 0
    return this.record({
      provider,
      inputChars,
      outputChars,
      durationMs: result.durationMs ?? 0
    })
  }

  async reset(): Promise<void> {
    await this.save(emptySummary())
  }

  private async record(entry: {
    provider: UsageProvider
    inputChars: number
    outputChars: number
    durationMs: number
  }): Promise<UsageSummary> {
    const summary = await this.getSummary()
    const target = summary.providers[entry.provider]
    target.tasks += 1
    target.inputChars += entry.inputChars
    target.outputChars += entry.outputChars
    target.durationMs += entry.durationMs
    summary.lastUpdated = new Date().toISOString()
    await this.save(summary)
    return summary
  }

  private summaryPath(): string {
    return join(this.baseDir, 'usage.json')
  }

  private async save(summary: UsageSummary): Promise<void> {
    await fs.mkdir(dirname(this.summaryPath()), { recursive: true })
    await fs.writeFile(this.summaryPath(), JSON.stringify(summary, null, 2), 'utf-8')
  }

  static providerForAgent(agent: AgentType): UsageProvider {
    if (agent === 'claude-code') return 'claude'
    if (agent === 'codex') return 'openai'
    if (agent === 'gemini-cli') return 'gemini'
    return 'other'
  }
}
