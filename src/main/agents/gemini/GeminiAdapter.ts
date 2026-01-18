import { spawn } from 'child_process'
import { AgentAdapter } from '../base/AgentAdapter'
import { Task, TaskResult } from '../../types'
import { GeminiSettings } from '../../settings/Settings'

interface GeminiEvent {
  type?: string
  role?: string
  message?: string
  data?: unknown
  result?: unknown
}

export class GeminiAdapter extends AgentAdapter {
  name: Task['agent'] = 'gemini-cli'

  constructor(private settings?: GeminiSettings) {
    super()
  }

  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn('gemini', ['--version'])
      child.on('error', () => {
        this.logger?.log('error', 'gemini:isAvailable', { ok: false })
        resolve(false)
      })
      child.on('exit', (code) => {
        const ok = code === 0
        this.logger?.log('info', 'gemini:isAvailable', { ok })
        resolve(ok)
      })
    })
  }

  async execute(task: Task): Promise<TaskResult> {
    const startedAt = Date.now()

    const outputFormat = this.settings?.outputFormat ?? 'stream-json'
    const args = ['--output-format', outputFormat, '--prompt', task.description]
    if (this.settings?.model) {
      args.push('--model', this.settings.model)
    }

    const child = spawn('gemini', args, { cwd: task.workspace })

    await this.logger?.log('info', 'gemini:execute', {
      taskId: task.id,
      model: this.settings?.model ?? null,
      outputFormat,
      args
    })

    let buffer = ''
    let lastMessage = ''
    const errors: string[] = []

    const handleEvent = (event: GeminiEvent): void => {
      if (event.type === 'message' && typeof event.message === 'string') {
        lastMessage = event.message
        this.streamSink?.({ taskId: task.id, agent: this.name, text: `${event.message}\n` })
      }
      if (event.type === 'result' && event.result) {
        lastMessage = this.extractText(event.result)
        if (lastMessage) {
          this.streamSink?.({ taskId: task.id, agent: this.name, text: `${lastMessage}\n` })
        }
      }
      if (event.type === 'error') {
        errors.push(JSON.stringify(event))
      }
    }

    const parseLine = (line: string): void => {
      if (!line) return
      try {
        const event = JSON.parse(line) as GeminiEvent
        handleEvent(event)
      } catch (error) {
        errors.push(`Failed to parse Gemini event: ${String(error)}`)
      }
    }

    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString()
      let index = buffer.indexOf('\n')
      while (index >= 0) {
        const line = buffer.slice(0, index).trim()
        buffer = buffer.slice(index + 1)
        index = buffer.indexOf('\n')
        parseLine(line)
      }
    })

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString()
      errors.push(text)
      this.streamSink?.({ taskId: task.id, agent: this.name, text: `[stderr] ${text}` })
    })

    const exitCode = await new Promise<number>((resolve) => {
      child.on('close', (code) => resolve(code ?? 0))
    })

    if (buffer.trim().length) {
      if (outputFormat === 'json') {
        try {
          const event = JSON.parse(buffer) as GeminiEvent
          handleEvent(event)
        } catch (error) {
          errors.push(`Failed to parse Gemini JSON output: ${String(error)}`)
        }
      } else {
        buffer
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .forEach(parseLine)
      }
    }

    if (exitCode !== 0 && errors.length === 0) {
      errors.push(`Gemini CLI exited with code ${exitCode}`)
    }

    await this.logger?.log('info', 'gemini:completed', {
      taskId: task.id,
      exitCode,
      errorCount: errors.length
    })

    return {
      id: task.id,
      status: errors.length ? 'failed' : 'completed',
      durationMs: Date.now() - startedAt,
      agent: this.name,
      filesModified: [],
      summary: lastMessage || 'Gemini agent completed the task.',
      handoffNotes: [],
      errors
    }
  }

  private extractText(result: unknown): string {
    if (typeof result === 'string') return result
    if (!result || typeof result !== 'object') return ''

    const record = result as Record<string, unknown>
    if (typeof record.text === 'string') return record.text
    if (typeof record.content === 'string') return record.content
    if (typeof record.message === 'string') return record.message

    return ''
  }
}
