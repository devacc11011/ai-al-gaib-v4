import { TaskResult } from '../types'

export class ResultAggregator {
  aggregate(results: TaskResult[]): { summary: string; errors: string[] } {
    const errors = results.flatMap((result) => result.errors)
    const summary = results
      .map((result) => `[${result.id}] ${result.status}: ${result.summary}`)
      .join('\n')

    return { summary, errors }
  }
}
