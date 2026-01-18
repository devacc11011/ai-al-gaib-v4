import { AgentAdapter } from '../base/AgentAdapter'
import { Task, TaskResult } from '../../types'

export class MockAdapter extends AgentAdapter {
  name: Task['agent'] = 'mock'

  async isAvailable(): Promise<boolean> {
    return true
  }

  async execute(task: Task): Promise<TaskResult> {
    const startedAt = Date.now()
    await new Promise((resolve) => setTimeout(resolve, 300))

    return {
      id: task.id,
      status: 'completed',
      durationMs: Date.now() - startedAt,
      agent: this.name,
      filesModified: [],
      summary: `Mock agent executed: ${task.title}`,
      handoffNotes: ['Replace MockAdapter with real agent adapter when ready.'],
      errors: []
    }
  }
}
