import { AgentRegistry } from '../agents/AgentRegistry'
import { ContextManager } from '../context/ContextManager'
import { EventBus } from './EventBus'
import { Task, TaskResult } from '../types'

export class Executor {
  constructor(
    private eventBus: EventBus,
    private contextManager: ContextManager,
    private adapters: AgentRegistry
  ) {}

  async execute(task: Task): Promise<TaskResult> {
    this.eventBus.emitEvent({
      type: 'task:started',
      timestamp: new Date().toISOString(),
      data: { taskId: task.id, agent: task.agent }
    })

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

      this.eventBus.emitEvent({
        type: 'task:completed',
        timestamp: new Date().toISOString(),
        data: { taskId: task.id, status: 'failed' }
      })

      return errorResult
    }

    const available = await adapter.isAvailable()
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

      this.eventBus.emitEvent({
        type: 'task:completed',
        timestamp: new Date().toISOString(),
        data: { taskId: task.id, status: 'failed' }
      })

      return errorResult
    }

    task.status = 'running'
    const result = await adapter.execute(task)
    task.status = result.status

    await this.contextManager.writeResult(result)

    this.eventBus.emitEvent({
      type: 'task:completed',
      timestamp: new Date().toISOString(),
      data: { taskId: task.id, status: result.status }
    })

    return result
  }
}
