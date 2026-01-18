import { EventEmitter } from 'events'
import { OrchestratorEvent } from '../types'

export class EventBus extends EventEmitter {
  emitEvent<T>(event: OrchestratorEvent<T>): void {
    this.emit(event.type, event)
    this.emit('event', event)
  }
}
