import { join } from 'path'
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
import { OrchestratorEvent, TaskResult } from '../types'
import { Settings } from '../settings/Settings'
import { SettingsStore } from '../settings/SettingsStore'
import { SecretsStore, Secrets } from '../settings/SecretsStore'

export class Orchestrator {
  private eventBus = new EventBus()
  private planner = new Planner()
  private resultAggregator = new ResultAggregator()
  private contextManager: ContextManager
  private executor: Executor
  private settingsStore: SettingsStore
  private secretsStore: SecretsStore
  private adapters: AgentRegistry

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
    await this.contextManager.ensure()

    const settings = await this.settingsStore.load()
    const secrets = await this.secretsStore.load()
    this.applySecrets(secrets)
    this.adapters.register(new MockAdapter())
    this.adapters.register(new ClaudeAdapter(settings.claude))
    this.adapters.register(new CodexAdapter(settings.codex))
    this.adapters.register(new GeminiAdapter(settings.gemini))
    const { plan, graph } = this.planner.createPlan(
      prompt,
      settings.activeAgent,
      this.workspaceRoot
    )

    this.eventBus.emitEvent({
      type: 'plan:created',
      timestamp: new Date().toISOString(),
      data: { planId: plan.id, tasks: plan.tasks.map((task) => task.id) }
    })

    for (const task of plan.tasks) {
      await this.contextManager.writeTask(task)
    }

    const results: TaskResult[] = []
    while (graph.hasPending()) {
      const readyTasks = graph.readyTasks()
      if (readyTasks.length === 0) {
        const errors = ['No runnable tasks found (possible dependency cycle).']
        this.eventBus.emitEvent({
          type: 'run:failed',
          timestamp: new Date().toISOString(),
          data: { planId: plan.id, errors }
        })
        return { planId: plan.id, summary: errors.join(' ') }
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
    } else {
      this.eventBus.emitEvent({
        type: 'run:completed',
        timestamp: new Date().toISOString(),
        data: { planId: plan.id, summary: aggregated.summary }
      })
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
}
