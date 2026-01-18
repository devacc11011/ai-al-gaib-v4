import { AgentRegistry } from '../agents/AgentRegistry'
import { ContextManager } from '../context/ContextManager'
import { EventBus } from './EventBus'
import { Logger } from '../logging/Logger'
import { Task, TaskResult } from '../types'
import { UsageStore } from '../usage/UsageStore'

export class Executor {
  constructor(
    private eventBus: EventBus,
    private contextManager: ContextManager,
    private adapters: AgentRegistry,
    private logger?: Logger,
    private usageStore?: UsageStore,
    private approvalHandler?: (payload: {
      taskId: string
      agent: Task['agent']
      toolName: string
      input: unknown
    }) => Promise<boolean>
  ) {}

  async execute(task: Task): Promise<TaskResult> {
    this.eventBus.emitEvent({
      type: 'task:started',
      timestamp: new Date().toISOString(),
      data: { taskId: task.id, agent: task.agent }
    })
    await this.logger?.log('info', 'executor:starting_task', {
      taskId: task.id,
      agent: task.agent
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
      await this.logger?.log('error', 'executor:adapter_missing', {
        taskId: task.id,
        agent: task.agent
      })

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
        data: { ...payload, stage: 'executor' }
      })
      this.logger?.log('info', 'agent:stream', {
        taskId: payload.taskId,
        agent: payload.agent,
        length: payload.text.length
      })
    })
    adapter.setApprovalHandler(this.approvalHandler)
    const available = await adapter.isAvailable()
    await this.logger?.log('info', 'executor:agent_available', {
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
      await this.logger?.log('error', 'executor:agent_unavailable', {
        taskId: task.id,
        agent: task.agent
      })

      this.eventBus.emitEvent({
        type: 'task:completed',
        timestamp: new Date().toISOString(),
        data: { taskId: task.id, status: 'failed' }
      })

      return errorResult
    }

    task.status = 'running'
    await this.logger?.log('info', 'executor:running_task', {
      taskId: task.id,
      agent: task.agent
    })
    const result = await adapter.execute(task)
    task.status = result.status

    await this.contextManager.writeResult(result)
    await this.usageStore?.recordTask(task, result)
    await this.logger?.log('info', 'executor:task_completed', {
      taskId: task.id,
      status: result.status
    })

    this.eventBus.emitEvent({
      type: 'task:completed',
      timestamp: new Date().toISOString(),
      data: { taskId: task.id, status: result.status }
    })

    return result
  }
}
