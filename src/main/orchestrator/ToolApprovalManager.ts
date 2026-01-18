import { randomUUID } from 'crypto'
import { EventBus } from './EventBus'

export interface ToolApprovalRequest {
  id: string
  taskId: string
  agent: string
  toolName: string
  input: unknown
  createdAt: string
}

export class ToolApprovalManager {
  private pending = new Map<string, (decision: boolean) => void>()

  constructor(private eventBus: EventBus) {}

  async request(payload: Omit<ToolApprovalRequest, 'id' | 'createdAt'>): Promise<boolean> {
    const id = `tool-${randomUUID()}`
    const request: ToolApprovalRequest = {
      ...payload,
      id,
      createdAt: new Date().toISOString()
    }

    this.eventBus.emitEvent({
      type: 'tool:request',
      timestamp: new Date().toISOString(),
      data: request
    })

    return new Promise((resolve) => {
      this.pending.set(id, resolve)
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          resolve(false)
          this.eventBus.emitEvent({
            type: 'tool:decision',
            timestamp: new Date().toISOString(),
            data: { id, decision: 'timeout' }
          })
        }
      }, 60000)
    })
  }

  resolve(id: string, allow: boolean): void {
    const resolver = this.pending.get(id)
    if (!resolver) return
    this.pending.delete(id)
    resolver(allow)
    this.eventBus.emitEvent({
      type: 'tool:decision',
      timestamp: new Date().toISOString(),
      data: { id, decision: allow ? 'allow' : 'deny' }
    })
  }
}
