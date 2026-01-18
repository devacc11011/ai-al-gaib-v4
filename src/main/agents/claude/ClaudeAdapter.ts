import { AgentAdapter } from '../base/AgentAdapter'
import { Task, TaskResult } from '../../types'
import { ClaudeSettings } from '../../settings/Settings'
import { resolve } from 'path'

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

    const enforcedAllowedTools = ['Read', 'Write', 'Edit']
    const allowedTools = (this.settings?.allowedTools ?? enforcedAllowedTools).filter((tool) =>
      enforcedAllowedTools.includes(tool)
    )

    const options = {
      model: this.settings?.model,
      cwd: task.workspace,
      additionalDirectories: [task.workspace, ...(this.settings?.additionalDirectories ?? [])],
      permissionMode: this.settings?.permissionMode ?? 'acceptEdits',
      maxTurns: this.settings?.maxTurns ?? 10,
      allowedTools,
      settingSources: this.settings?.settingSources ?? ['project']
    } as Record<string, unknown>

    options['canUseTool'] = async (toolName: string, input: unknown) => {
      const decision = this.evaluateToolAccess(task.workspace, toolName, input)
      await this.logger?.log('info', 'agent:tool_request', {
        taskId: task.id,
        agent: this.name,
        toolName,
        decision: decision.allowed ? 'allow' : 'deny',
        reason: decision.reason
      })
      if (!decision.allowed) {
        this.streamSink?.({
          taskId: task.id,
          agent: this.name,
          text: `[tool denied] ${toolName} - ${decision.reason}\n`
        })
        return false
      }

      if (!this.approvalHandler) {
        return true
      }

      const approved = await this.approvalHandler({
        taskId: task.id,
        agent: this.name,
        toolName,
        input
      })

      await this.logger?.log('info', 'agent:tool_decision', {
        taskId: task.id,
        agent: this.name,
        toolName,
        decision: approved ? 'allow' : 'deny'
      })

      if (!approved) {
        this.streamSink?.({
          taskId: task.id,
          agent: this.name,
          text: `[tool denied] ${toolName} - user denied\n`
        })
      }

      return approved
    }

    async function* inputStream() {
      yield {
        type: 'user',
        message: {
          role: 'user',
          content: task.description
        }
      }
    }

    await this.logger?.log('info', 'claude:execute', {
      taskId: task.id,
      model: this.settings?.model ?? null,
      permissionMode: options.permissionMode,
      maxTurns: options.maxTurns,
      allowedTools
    })

    let lastText = ''
    let chunkCount = 0
    const stream = query({ prompt: inputStream(), options })

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

  private evaluateToolAccess(
    workspacePath: string,
    toolName: string,
    input: unknown
  ): { allowed: boolean; reason: string } {
    if (!['Read', 'Write', 'Edit'].includes(toolName)) {
      return { allowed: false, reason: 'tool_not_allowed' }
    }

    const pathValue = this.extractPath(input)
    if (!pathValue) {
      return { allowed: false, reason: 'missing_path' }
    }

    const resolved = resolve(workspacePath, pathValue)
    const normalizedWorkspace = resolve(workspacePath)
    const allowed = resolved === normalizedWorkspace || resolved.startsWith(`${normalizedWorkspace}/`)

    return {
      allowed,
      reason: allowed ? 'within_workspace' : 'outside_workspace'
    }
  }

  private extractPath(input: unknown): string | null {
    if (!input || typeof input !== 'object') return null
    const record = input as Record<string, unknown>
    const candidates = [
      record.path,
      record.file_path,
      record.filePath,
      record.target_path,
      record.directory
    ]
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
    }
    return null
  }
}
