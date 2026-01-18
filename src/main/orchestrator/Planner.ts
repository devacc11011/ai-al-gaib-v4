import { randomUUID } from 'crypto'
import { Plan, Task, AgentType } from '../types'
import { TaskGraph } from '../graph/TaskGraph'

export class Planner {
  createPlan(prompt: string, agent: AgentType, workspace: string): { plan: Plan; graph: TaskGraph } {
    const taskLines = prompt
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    const primaryDescription = taskLines[0] ?? 'No description provided.'
    const followUpDescription =
      taskLines.slice(1).join(' ') || 'Summarize results and propose next steps.'

    const task: Task = {
      id: `task-${randomUUID()}`,
      title: 'Core execution',
      agent,
      status: 'pending',
      dependencies: [],
      workspace,
      description: primaryDescription,
      inputContext: ['User prompt provided via UI', `Prompt lines: ${taskLines.length}`],
      expectedOutput: ['Create a result summary', 'Verify core pipeline flow']
    }

    const followUpTask: Task = {
      id: `task-${randomUUID()}`,
      title: 'Follow-up summary',
      agent,
      status: 'pending',
      dependencies: [task.id],
      workspace,
      description: followUpDescription,
      inputContext: ['Depends on task-001 result'],
      expectedOutput: ['Summarize task-001 output', 'List next steps']
    }

    const graph = new TaskGraph()
    graph.add(task)
    graph.add(followUpTask)

    const plan: Plan = {
      id: `plan-${randomUUID()}`,
      createdAt: new Date().toISOString(),
      tasks: [task, followUpTask]
    }

    return { plan, graph }
  }

  buildPlanFromTasks(tasks: Task[]): { plan: Plan; graph: TaskGraph } {
    const graph = new TaskGraph()
    tasks.forEach((task) => graph.add(task))

    const plan: Plan = {
      id: `plan-${randomUUID()}`,
      createdAt: new Date().toISOString(),
      tasks
    }

    return { plan, graph }
  }
}
