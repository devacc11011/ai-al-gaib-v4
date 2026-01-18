import { AgentAdapter } from '../base/AgentAdapter'
import { Task, TaskResult } from '../../types'
import { ClaudeSettings } from '../../settings/Settings'

export class ClaudeAdapter extends AgentAdapter {
  name: Task['agent'] = 'claude-code'

  constructor(private settings?: ClaudeSettings) {
    super()
  }

  async isAvailable(): Promise<boolean> {
    try {
      await import('@anthropic-ai/claude-agent-sdk')
    } catch {
      return false
    }

    const hasKey = Boolean(
      process.env.ANTHROPIC_API_KEY ||
        process.env.CLAUDE_CODE_USE_BEDROCK ||
        process.env.CLAUDE_CODE_USE_VERTEX ||
        process.env.CLAUDE_CODE_USE_FOUNDRY
    )

    return hasKey
  }

  async execute(task: Task): Promise<TaskResult> {
    const startedAt = Date.now()
    const { query } = await import('@anthropic-ai/claude-agent-sdk')

    const options = {
      cwd: task.workspace,
      additionalDirectories: [task.workspace, ...(this.settings?.additionalDirectories ?? [])],
      permissionMode: this.settings?.permissionMode ?? 'acceptEdits',
      maxTurns: this.settings?.maxTurns ?? 10,
      allowedTools: this.settings?.allowedTools ?? ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
      settingSources: this.settings?.settingSources ?? ['project']
    } as Record<string, unknown>

    let lastText = ''
    const stream = query({ prompt: task.description, options })

    for await (const chunk of stream as AsyncIterable<unknown>) {
      const text = this.extractText(chunk)
      if (text) lastText = text
    }

    return {
      id: task.id,
      status: 'completed',
      durationMs: Date.now() - startedAt,
      agent: this.name,
      filesModified: [],
      summary: lastText || 'Claude agent completed the task.',
      handoffNotes: [],
      errors: []
    }
  }

  private extractText(chunk: unknown): string {
    if (typeof chunk === 'string') return chunk
    if (!chunk || typeof chunk !== 'object') return ''

    const record = chunk as Record<string, unknown>
    const direct = record.content
    if (typeof direct === 'string') return direct
    if (Array.isArray(direct)) {
      const textParts = direct
        .map((item) => {
          if (typeof item === 'string') return item
          if (item && typeof item === 'object') {
            const itemRecord = item as Record<string, unknown>
            if (typeof itemRecord.text === 'string') return itemRecord.text
          }
          return ''
        })
        .filter(Boolean)
      if (textParts.length) return textParts.join('')
    }

    if (typeof record.message === 'string') return record.message
    return ''
  }
}
