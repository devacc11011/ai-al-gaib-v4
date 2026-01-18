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
      await this.logger?.log('error', 'claude:isAvailable', { hasKey: false, reason: 'sdk_import_failed' })
      return false
    }

    const hasKey = Boolean(
      process.env.ANTHROPIC_API_KEY ||
        process.env.CLAUDE_CODE_USE_BEDROCK ||
        process.env.CLAUDE_CODE_USE_VERTEX ||
        process.env.CLAUDE_CODE_USE_FOUNDRY
    )

    await this.logger?.log('info', 'claude:isAvailable', { hasKey })
    return hasKey
  }

  async execute(task: Task): Promise<TaskResult> {
    const startedAt = Date.now()
    const { query } = await import('@anthropic-ai/claude-agent-sdk')

    const options = {
      model: this.settings?.model,
      cwd: task.workspace,
      additionalDirectories: [task.workspace, ...(this.settings?.additionalDirectories ?? [])],
      permissionMode: this.settings?.permissionMode ?? 'acceptEdits',
      maxTurns: this.settings?.maxTurns ?? 10,
      allowedTools: this.settings?.allowedTools ?? ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
      settingSources: this.settings?.settingSources ?? ['project']
    } as Record<string, unknown>

    await this.logger?.log('info', 'claude:execute', {
      taskId: task.id,
      model: this.settings?.model ?? null,
      permissionMode: options.permissionMode,
      maxTurns: options.maxTurns,
      allowedToolsCount: Array.isArray(options.allowedTools) ? options.allowedTools.length : 0
    })

    let lastText = ''
    let chunkCount = 0
    const stream = query({ prompt: task.description, options })

    for await (const chunk of stream as AsyncIterable<unknown>) {
      chunkCount += 1
      const { text, isFinal } = this.extractText(chunk)
      if (text) {
        lastText = isFinal ? text : `${lastText}${text}`
        this.streamSink?.({ taskId: task.id, agent: this.name, text })
      }
      if (isFinal && text) break
    }

    await this.logger?.log('info', 'claude:stream_summary', {
      taskId: task.id,
      chunkCount,
      lastTextLength: lastText.length
    })

    if (!lastText) {
      this.streamSink?.({ taskId: task.id, agent: this.name, text: '[no-stream-text]\n' })
    }

    await this.logger?.log('info', 'claude:completed', { taskId: task.id })

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

  private extractText(chunk: unknown): { text: string; isFinal: boolean } {
    if (typeof chunk === 'string') return { text: chunk, isFinal: false }
    if (!chunk || typeof chunk !== 'object') return { text: '', isFinal: false }

    const record = chunk as Record<string, unknown>
    if (record.type === 'result' && record.result) {
      const result = record.result
      if (typeof result === 'string') return { text: result, isFinal: true }
      if (result && typeof result === 'object') {
        const resultRecord = result as Record<string, unknown>
        if (typeof resultRecord.text === 'string') return { text: resultRecord.text, isFinal: true }
      }
    }

    if (record.type === 'message' && record.message && typeof record.message === 'object') {
      const message = record.message as Record<string, unknown>
      const content = message.content
      if (typeof content === 'string') return { text: content, isFinal: false }
      if (Array.isArray(content)) {
        const textParts = content
          .map((item) => {
            if (typeof item === 'string') return item
            if (item && typeof item === 'object') {
              const itemRecord = item as Record<string, unknown>
              if (typeof itemRecord.text === 'string') return itemRecord.text
            }
            return ''
          })
          .filter(Boolean)
        if (textParts.length) return { text: textParts.join(''), isFinal: false }
      }
    }

    const direct = record.content
    if (typeof direct === 'string') return { text: direct, isFinal: false }
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
      if (textParts.length) return { text: textParts.join(''), isFinal: false }
    }

    if (typeof record.message === 'string') return { text: record.message, isFinal: false }
    return { text: '', isFinal: false }
  }
}
