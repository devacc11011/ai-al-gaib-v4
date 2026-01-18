import { promises as fs } from 'fs'
import { join } from 'path'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export class Logger {
  private ready: Promise<void>
  private filePath: string

  constructor(baseDir: string, fileName: string) {
    this.filePath = join(baseDir, fileName)
    this.ready = fs.mkdir(baseDir, { recursive: true }).then(() => undefined)
  }

  async log(level: LogLevel, message: string, meta?: Record<string, unknown>): Promise<void> {
    await this.ready
    const payload = {
      ts: new Date().toISOString(),
      level,
      message,
      ...(meta ? { meta } : {})
    }
    await fs.appendFile(this.filePath, `${JSON.stringify(payload)}\n`, 'utf-8')
  }
}
