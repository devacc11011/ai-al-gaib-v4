import { AgentRegistry } from '../agents/AgentRegistry'
import { ContextManager } from '../context/ContextManager'
import { EventBus } from './EventBus'
import { Logger } from '../logging/Logger'
import { Task, TaskResult } from '../types'

export class Executor {
  constructor(
    private eventBus: EventBus,
    private contextManager: ContextManager,
    private adapters: AgentRegistry,
    private logger?: Logger
  ) {}

  async execute(task: Task): Promise<TaskResult> {
    this.eventBus.emitEvent({
      type: 'task:started',
      timestamp: new Date().toISOString(),
      data: { taskId: task.id, agent: task.agent }
    })
    await this.logger?.log('info', 'task:started', { taskId: task.id, agent: task.agent })

    const adapter = this.adapters.get(task.agent)
    if (!adapter) {
      task.status = 'failed'
      const errorResult: TaskResult = {
        id: task.id,
        status: 'failed',
        durationMs: 0,
        agent: task.agent,
        filesModified: [],
        summary: 'No adapter available for selected agent.',
        handoffNotes: [],
        errors: [`Adapter not found for ${task.agent}`]
      }

      await this.contextManager.writeResult(errorResult)
      await this.logger?.log('error', 'adapter:missing', { taskId: task.id, agent: task.agent })

      this.eventBus.emitEvent({
        type: 'task:completed',
        timestamp: new Date().toISOString(),
        data: { taskId: task.id, status: 'failed' }
      })

      return errorResult
    }

    adapter.setLogger(this.logger)
    adapter.setStreamSink((payload) => {
      this.eventBus.emitEvent({
        type: 'agent:stream',
        timestamp: new Date().toISOString(),
        data: payload
      })
      this.logger?.log('info', 'agent:stream', {
        taskId: payload.taskId,
        agent: payload.agent,
        length: payload.text.length
      })
    })
    const available = await adapter.isAvailable()
    await this.logger?.log('info', 'agent:availability', {
      taskId: task.id,
      agent: task.agent,
      available
    })
    if (!available) {
      task.status = 'failed'
      const errorResult: TaskResult = {
        id: task.id,
        status: 'failed',
        durationMs: 0,
        agent: task.agent,
        filesModified: [],
        summary: 'Selected agent is not available.',
        handoffNotes: [],
        errors: [`Agent ${task.agent} is not available or missing credentials.`]
      }

      await this.contextManager.writeResult(errorResult)
      await this.logger?.log('error', 'agent:unavailable', { taskId: task.id, agent: task.agent })

      this.eventBus.emitEvent({
        type: 'task:completed',
        timestamp: new Date().toISOString(),
        data: { taskId: task.id, status: 'failed' }
      })

      return errorResult
    }

    task.status = 'running'
    await this.logger?.log('info', 'task:execute', {
      taskId: task.id,
      agent: task.agent
    })
    const result = await adapter.execute(task)
    task.status = result.status

    await this.contextManager.writeResult(result)
    await this.logger?.log('info', 'task:completed', { taskId: task.id, status: result.status })

    this.eventBus.emitEvent({
      type: 'task:completed',
      timestamp: new Date().toISOString(),
      data: { taskId: task.id, status: result.status }
    })

    return result
  }
}
