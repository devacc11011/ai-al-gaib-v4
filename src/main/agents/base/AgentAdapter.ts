import { Task, TaskResult } from '../../types'

export abstract class AgentAdapter {
  abstract name: Task['agent']
  abstract execute(task: Task): Promise<TaskResult>
  abstract isAvailable(): Promise<boolean>
}
