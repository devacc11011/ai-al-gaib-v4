import { join, resolve } from 'path'
import { ContextManager } from '../context/ContextManager'
import { MockAdapter } from '../agents/mock/MockAdapter'
import { ClaudeAdapter } from '../agents/claude/ClaudeAdapter'
import { CodexAdapter } from '../agents/codex/CodexAdapter'
import { GeminiAdapter } from '../agents/gemini/GeminiAdapter'
import { AgentRegistry } from '../agents/AgentRegistry'
import { Planner } from './Planner'
import { Executor } from './Executor'
import { ResultAggregator } from './ResultAggregator'
import { EventBus } from './EventBus'
import { randomUUID } from 'crypto'
import { AgentType, OrchestratorEvent, Task, TaskResult } from '../types'
import { Settings } from '../settings/Settings'
import { SettingsStore } from '../settings/SettingsStore'
import { SecretsStore, Secrets } from '../settings/SecretsStore'
import { Logger } from '../logging/Logger'

export class Orchestrator {
  private eventBus = new EventBus()
  private planner = new Planner()
  private resultAggregator = new ResultAggregator()
  private contextManager: ContextManager
  private executor: Executor
  private settingsStore: SettingsStore
  private secretsStore: SecretsStore
  private adapters: AgentRegistry
  private logger?: Logger

  constructor(private workspaceRoot: string) {
    const contextPath = join(this.workspaceRoot, '.context')
    this.contextManager = new ContextManager(contextPath)
    this.settingsStore = new SettingsStore(contextPath)
    this.secretsStore = new SecretsStore(contextPath)

    this.adapters = new AgentRegistry()
    this.executor = new Executor(this.eventBus, this.contextManager, this.adapters)
  }

  onEvent(listener: (event: OrchestratorEvent) => void): () => void {
    this.eventBus.on('event', listener)
    return () => this.eventBus.off('event', listener)
  }

  async getSettings(): Promise<Settings> {
    return this.settingsStore.load()
  }

  async updateSettings(partial: Partial<Settings>): Promise<Settings> {
    return this.settingsStore.update(partial)
  }

  async getSecrets(): Promise<Secrets> {
    return this.secretsStore.load()
  }

  async updateSecrets(partial: Partial<Secrets>): Promise<Secrets> {
    return this.secretsStore.update(partial)
  }

  async run(prompt: string): Promise<{ planId: string; summary: string }> {
    const settings = await this.settingsStore.load()
    const workspacePath = settings.workspacePath
      ? resolve(settings.workspacePath)
      : this.workspaceRoot

    this.contextManager = new ContextManager(join(workspacePath, '.context'))
    await this.contextManager.ensure()

    const runStamp = new Date().toISOString().replace(/[:.]/g, '-')
    this.logger = new Logger(join(workspacePath, '.logs'), `run-${runStamp}.log`)
    await this.logger.log('info', 'run:started', { prompt, workspacePath })

    const secrets = await this.secretsStore.load()
    this.applySecrets(secrets)
    await this.logger.log('info', 'secrets:loaded', {
      anthropicKey: Boolean(secrets.anthropicApiKey),
      openaiKey: Boolean(secrets.openaiApiKey),
      geminiKey: Boolean(secrets.geminiApiKey)
    })
    await this.logger.log('info', 'env:keys', {
      anthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
      openaiKey: Boolean(process.env.OPENAI_API_KEY),
      geminiKey: Boolean(process.env.GEMINI_API_KEY)
    })

    const plannerAgent = settings.planner?.agent ?? settings.activeAgent
    const executorAgent = settings.executor?.agent ?? settings.activeAgent
    await this.logger.log('info', 'agents:role', {
      planner: plannerAgent,
      executor: executorAgent
    })

    const claudeSettings = {
      ...settings.claude,
      model:
        executorAgent === 'claude-code' ? settings.executor?.model ?? settings.claude?.model : settings.claude?.model
    }
    const codexSettings = {
      ...settings.codex,
      model: executorAgent === 'codex' ? settings.executor?.model ?? settings.codex?.model : settings.codex?.model
    }
    const geminiSettings = {
      ...settings.gemini,
      model:
        executorAgent === 'gemini-cli' ? settings.executor?.model ?? settings.gemini?.model : settings.gemini?.model
    }
    this.adapters.register(new MockAdapter())
    this.adapters.register(new ClaudeAdapter(claudeSettings))
    this.adapters.register(new CodexAdapter(codexSettings))
    this.adapters.register(new GeminiAdapter(geminiSettings))
    this.executor = new Executor(this.eventBus, this.contextManager, this.adapters, this.logger)

    const plannerTasks = await this.generatePlanTasks(
      prompt,
      plannerAgent,
      settings,
      executorAgent,
      workspacePath
    )
    const { plan, graph } = plannerTasks
      ? this.planner.buildPlanFromTasks(plannerTasks)
      : this.planner.createPlan(prompt, executorAgent, workspacePath)

    this.eventBus.emitEvent({
      type: 'plan:created',
      timestamp: new Date().toISOString(),
      data: {
        planId: plan.id,
        tasks: plan.tasks.map((task) => task.id),
        workspacePath
      }
    })
    await this.logger.log('info', 'plan:created', { planId: plan.id, tasks: plan.tasks.map((t) => t.id) })

    for (const task of plan.tasks) {
      await this.contextManager.writeTask(task)
    }

    const results: TaskResult[] = []
    while (graph.hasPending()) {
      const readyTasks = graph.readyTasks()
      if (readyTasks.length === 0) {
        const failedTasks = graph
          .list()
          .filter((task) => task.status === 'failed')
          .map((task) => task.id)
        const errors = failedTasks.length
          ? [`Blocked by failed tasks: ${failedTasks.join(', ')}`]
          : ['No runnable tasks found (possible dependency cycle).']

        const aggregated = this.resultAggregator.aggregate(results)
        const combinedErrors = Array.from(new Set([...aggregated.errors, ...errors]))

        this.eventBus.emitEvent({
          type: 'run:failed',
          timestamp: new Date().toISOString(),
          data: { planId: plan.id, errors: combinedErrors }
        })
        await this.logger.log('error', 'run:failed', { planId: plan.id, errors: combinedErrors })
        return { planId: plan.id, summary: combinedErrors.join(' ') }
      }

      // Core MVP: execute sequentially to avoid file conflicts.
      for (const task of readyTasks) {
        const result = await this.executor.execute(task)
        results.push(result)
      }
    }

    const aggregated = this.resultAggregator.aggregate(results)

    if (aggregated.errors.length) {
      this.eventBus.emitEvent({
        type: 'run:failed',
        timestamp: new Date().toISOString(),
        data: { planId: plan.id, errors: aggregated.errors }
      })
      await this.logger.log('error', 'run:failed', { planId: plan.id, errors: aggregated.errors })
    } else {
      this.eventBus.emitEvent({
        type: 'run:completed',
        timestamp: new Date().toISOString(),
        data: { planId: plan.id, summary: aggregated.summary }
      })
      await this.logger.log('info', 'run:completed', { planId: plan.id })
    }

    return { planId: plan.id, summary: aggregated.summary }
  }

  private applySecrets(secrets: Secrets): void {
    if (secrets.anthropicApiKey && !process.env.ANTHROPIC_API_KEY) {
      process.env.ANTHROPIC_API_KEY = secrets.anthropicApiKey
    }
    if (secrets.openaiApiKey && !process.env.OPENAI_API_KEY) {
      process.env.OPENAI_API_KEY = secrets.openaiApiKey
    }
    if (secrets.geminiApiKey && !process.env.GEMINI_API_KEY) {
      process.env.GEMINI_API_KEY = secrets.geminiApiKey
    }
  }

  private async generatePlanTasks(
    prompt: string,
    plannerAgent: AgentType,
    settings: Settings,
    executorAgent: AgentType,
    workspacePath: string
  ): Promise<Task[] | null> {
    if (plannerAgent === 'mock') return null

    const plannerAdapter = this.createAdapterForAgent(plannerAgent, settings, settings.planner?.model)
    if (!plannerAdapter) return null
    const available = await plannerAdapter.isAvailable()
    if (!available) {
      await this.logger?.log('error', 'planner:unavailable', { plannerAgent })
      return null
    }

    const planPrompt = this.buildPlanPrompt(prompt)
    const planTask: Task = {
      id: 'planner-001',
      title: 'Planner',
      agent: plannerAgent,
      status: 'pending',
      dependencies: [],
      workspace: workspacePath,
      description: planPrompt,
      inputContext: ['Generate a JSON plan'],
      expectedOutput: ['JSON with tasks array']
    }

    const result = await plannerAdapter.execute(planTask)
    await this.logger?.log('info', 'planner:result', { status: result.status })

    const parsed = this.parsePlanFromText(result.summary, executorAgent, workspacePath)
    if (!parsed) {
      await this.logger?.log('error', 'planner:parse_failed', { summary: result.summary })
      return null
    }

    return parsed
  }

  private createAdapterForAgent(
    agent: AgentType,
    settings: Settings,
    modelOverride?: string
  ): MockAdapter | ClaudeAdapter | CodexAdapter | GeminiAdapter | null {
    const attach = (adapter: MockAdapter | ClaudeAdapter | CodexAdapter | GeminiAdapter) => {
      adapter.setLogger(this.logger)
      adapter.setStreamSink((payload) => {
        this.eventBus.emitEvent({
          type: 'agent:stream',
          timestamp: new Date().toISOString(),
          data: payload
        })
      })
      return adapter
    }

    if (agent === 'mock') {
      const adapter = new MockAdapter()
      return attach(adapter)
    }
    if (agent === 'claude-code') {
      const adapter = new ClaudeAdapter({ ...settings.claude, model: modelOverride })
      return attach(adapter)
    }
    if (agent === 'codex') {
      const adapter = new CodexAdapter({ ...settings.codex, model: modelOverride })
      return attach(adapter)
    }
    if (agent === 'gemini-cli') {
      const adapter = new GeminiAdapter({ ...settings.gemini, model: modelOverride })
      return attach(adapter)
    }
    return null
  }

  private buildPlanPrompt(prompt: string): string {
    return [
      'You are a planner. Generate a JSON plan for execution tasks.',
      'Return ONLY valid JSON with this shape:',
      '{\"tasks\":[{\"title\":\"...\",\"description\":\"...\",\"dependencies\":[1,2]}]}',
      'Dependencies use 1-based indices into the tasks array. Use 0-2 dependencies per task.',
      'Limit to 2-5 tasks. Use concise titles.',
      `User request: ${prompt}`
    ].join('\n')
  }

  private parsePlanFromText(
    text: string,
    executorAgent: AgentType,
    workspacePath: string
  ): Task[] | null {
    const raw = this.extractJson(text)
    if (!raw) return null

    try {
      const parsed = JSON.parse(raw) as { tasks?: Array<Record<string, unknown>> }
      if (!parsed.tasks || !Array.isArray(parsed.tasks) || parsed.tasks.length === 0) return null

      const taskIds = parsed.tasks.map(() => `task-${randomUUID()}`)
      const tasks: Task[] = parsed.tasks.map((item, index) => {
        const title = typeof item.title === 'string' ? item.title : `Task ${index + 1}`
        const description = typeof item.description === 'string' ? item.description : title
        const dependencies = Array.isArray(item.dependencies) ? item.dependencies : []
        const mappedDeps = dependencies
          .map((dep) => {
            if (typeof dep === 'number' && Number.isFinite(dep)) {
              const idx = dep - 1
              return idx >= 0 && idx < taskIds.length ? taskIds[idx] : null
            }
            if (typeof dep === 'string' && dep.startsWith('task-')) return dep
            return null
          })
          .filter(Boolean) as string[]

        return {
          id: taskIds[index],
          title,
          agent: executorAgent,
          status: 'pending',
          dependencies: mappedDeps,
          workspace: workspacePath,
          description,
          inputContext: ['Generated by planner'],
          expectedOutput: ['Provide execution summary']
        }
      })

      return tasks
    } catch {
      return null
    }
  }

  private extractJson(text: string): string | null {
    const fenceMatch = text.match(/```json\\s*([\\s\\S]*?)```/i)
    if (fenceMatch) return fenceMatch[1].trim()

    const firstBrace = text.indexOf('{')
    const lastBrace = text.lastIndexOf('}')
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return text.slice(firstBrace, lastBrace + 1)
    }

    return null
  }
}
