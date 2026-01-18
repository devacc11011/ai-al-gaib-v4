import { promises as fs } from 'fs'
import { dirname, join } from 'path'
import { Task, TaskResult } from '../types'

import { Logger } from '../logging/Logger'

export class ContextManager {
  constructor(private baseDir: string, private logger?: Logger) {}

  async ensure(): Promise<void> {
    await fs.mkdir(this.tasksDir(), { recursive: true })
    await fs.mkdir(this.sessionsDir(), { recursive: true })
    await fs.mkdir(this.agentsDir(), { recursive: true })
    await fs.mkdir(this.sharedDir(), { recursive: true })
  }

  async writeTask(task: Task): Promise<string> {
    const filePath = join(this.taskDir(task.id), 'task.md')
    await this.writeFile(filePath, this.taskMarkdown(task))
    await this.logger?.log('info', 'task:md_created', { taskId: task.id, path: filePath })
    return filePath
  }

  async writeResult(result: TaskResult): Promise<string> {
    const filePath = join(this.taskDir(result.id), 'result.md')
    await this.writeFile(filePath, this.resultMarkdown(result))
    await this.logger?.log('info', 'result:md_created', { taskId: result.id, path: filePath })
    return filePath
  }

  private tasksDir(): string {
    return join(this.baseDir, 'tasks')
  }

  private taskDir(taskId: string): string {
    return join(this.tasksDir(), taskId)
  }

  private sessionsDir(): string {
    return join(this.baseDir, 'sessions')
  }

  private agentsDir(): string {
    return join(this.baseDir, 'agents')
  }

  private sharedDir(): string {
    return join(this.baseDir, 'shared')
  }

  private async writeFile(path: string, contents: string): Promise<void> {
    await fs.mkdir(dirname(path), { recursive: true })
    await fs.writeFile(path, contents, 'utf-8')
  }

  private taskMarkdown(task: Task): string {
    return [
      `# Task: ${task.title}`,
      '',
      '## Metadata',
      `- ID: ${task.id}`,
      `- Agent: ${task.agent}`,
      `- Status: ${task.status}`,
      `- Dependencies: [${task.dependencies.join(', ')}]`,
      `- Workspace: ${task.workspace}`,
      '',
      '## Description',
      task.description,
      '',
      '## Input Context',
      ...task.inputContext.map((item) => `- ${item}`),
      '',
      '## Expected Output',
      ...task.expectedOutput.map((item) => `- ${item}`),
      ''
    ].join('\n')
  }

  private resultMarkdown(result: TaskResult): string {
    return [
      `# Result: ${result.id}`,
      '',
      '## Metadata',
      `- ID: ${result.id}`,
      `- Status: ${result.status}`,
      `- Duration: ${Math.round(result.durationMs)}ms`,
      `- Agent: ${result.agent}`,
      '',
      '## Files Modified',
      ...(result.filesModified.length
        ? result.filesModified.map((file) => `- ${file}`)
        : ['- (none)']),
      '',
      '## Summary',
      result.summary,
      '',
      '## Handoff Notes',
      ...(result.handoffNotes.length
        ? result.handoffNotes.map((note) => `- ${note}`)
        : ['- (none)']),
      '',
      '## Errors (if any)',
      ...(result.errors.length ? result.errors.map((err) => `- ${err}`) : ['- (none)']),
      ''
    ].join('\n')
  }
}
