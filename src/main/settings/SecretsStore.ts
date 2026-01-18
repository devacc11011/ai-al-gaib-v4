import { promises as fs } from 'fs'
import { dirname, join } from 'path'

export interface Secrets {
  anthropicApiKey?: string
  openaiApiKey?: string
  geminiApiKey?: string
}

const DEFAULT_SECRETS: Secrets = {}

export class SecretsStore {
  constructor(private baseDir: string) {}

  private secretsPath(): string {
    return join(this.baseDir, 'secrets.json')
  }

  async load(): Promise<Secrets> {
    try {
      const data = await fs.readFile(this.secretsPath(), 'utf-8')
      const parsed = JSON.parse(data) as Secrets
      return { ...DEFAULT_SECRETS, ...parsed }
    } catch {
      await this.save(DEFAULT_SECRETS)
      return DEFAULT_SECRETS
    }
  }

  async save(secrets: Secrets): Promise<void> {
    await fs.mkdir(dirname(this.secretsPath()), { recursive: true })
    await fs.writeFile(this.secretsPath(), JSON.stringify(secrets, null, 2), 'utf-8')
  }

  async update(partial: Partial<Secrets>): Promise<Secrets> {
    const current = await this.load()
    const normalized: Partial<Secrets> = {}
    if (partial.anthropicApiKey !== undefined) {
      normalized.anthropicApiKey = partial.anthropicApiKey.trim() || undefined
    }
    if (partial.openaiApiKey !== undefined) {
      normalized.openaiApiKey = partial.openaiApiKey.trim() || undefined
    }
    if (partial.geminiApiKey !== undefined) {
      normalized.geminiApiKey = partial.geminiApiKey.trim() || undefined
    }

    const next = { ...current, ...normalized }
    await this.save(next)
    return next
  }
}
