import { Task } from '../types'

export class TaskGraph {
  private tasks = new Map<string, Task>()

  add(task: Task): void {
    this.tasks.set(task.id, task)
  }

  get(id: string): Task | undefined {
    return this.tasks.get(id)
  }

  list(): Task[] {
    return Array.from(this.tasks.values())
  }

  hasPending(): boolean {
    return this.list().some((task) => task.status === 'pending')
  }

  readyTasks(): Task[] {
    return this.list().filter(
      (task) =>
        task.status === 'pending' &&
        task.dependencies.every((dep) => this.tasks.get(dep)?.status === 'completed')
    )
  }
}
