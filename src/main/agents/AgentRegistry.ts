import { AgentAdapter } from './base/AgentAdapter'
import { AgentType } from '../types'

export class AgentRegistry {
  private adapters = new Map<AgentType, AgentAdapter>()

  register(adapter: AgentAdapter): void {
    this.adapters.set(adapter.name, adapter)
  }

  get(name: AgentType): AgentAdapter | undefined {
    return this.adapters.get(name)
  }

  list(): AgentAdapter[] {
    return Array.from(this.adapters.values())
  }
}
