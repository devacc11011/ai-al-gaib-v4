import { AgentAdapter } from '../base/AgentAdapter'
import { Task, TaskResult } from '../../types'
import { CodexSettings } from '../../settings/Settings'

export class CodexAdapter extends AgentAdapter {
  name: Task['agent'] = 'codex'

  constructor(private settings?: CodexSettings) {
    super()
  }

  async isAvailable(): Promise<boolean> {
    try {
      await import('@openai/codex-sdk')
      const hasKey = Boolean(process.env.OPENAI_API_KEY)
      await this.logger?.log('info', 'codex:isAvailable', { hasKey })
      return hasKey
    } catch {
      return false
    }
  }

  async execute(task: Task): Promise<TaskResult> {
    const startedAt = Date.now()
    const { Codex } = await import('@openai/codex-sdk')

    const codex = new Codex({ model: this.settings?.model } as Record<string, unknown>)
    const thread = this.settings?.threadId
      ? codex.resumeThread(this.settings.threadId)
      : codex.startThread()

    await this.logger?.log('info', 'codex:execute', {
      taskId: task.id,
      model: this.settings?.model ?? null,
      threadId: this.settings?.threadId ?? 'new'
    })

    const result = await thread.run(task.description)
    const summary = this.extractText(result)

    if (summary) {
      this.streamSink?.({ taskId: task.id, agent: this.name, text: `${summary}\n` })
    }

    await this.logger?.log('info', 'codex:completed', { taskId: task.id })

    return {
      id: task.id,
      status: 'completed',
      durationMs: Date.now() - startedAt,
      agent: this.name,
      filesModified: [],
      summary: summary || 'Codex agent completed the task.',
      handoffNotes: [],
      errors: []
    }
  }

  private extractText(result: unknown): string {
    if (typeof result === 'string') return result
    if (!result || typeof result !== 'object') return ''

    const record = result as Record<string, unknown>
    if (typeof record.output === 'string') return record.output
    if (typeof record.text === 'string') return record.text
    if (typeof record.content === 'string') return record.content

    return ''
  }
}
