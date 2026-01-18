import { Task, TaskResult } from '../../types'
import { Logger } from '../../logging/Logger'

export abstract class AgentAdapter {
  abstract name: Task['agent']
  abstract execute(task: Task): Promise<TaskResult>
  abstract isAvailable(): Promise<boolean>

  protected logger?: Logger
  protected streamSink?: (payload: { taskId: string; agent: Task['agent']; text: string }) => void

  setLogger(logger?: Logger): void {
    this.logger = logger
  }

  setStreamSink(
    sink?: (payload: { taskId: string; agent: Task['agent']; text: string }) => void
  ): void {
    this.streamSink = sink
  }
}
