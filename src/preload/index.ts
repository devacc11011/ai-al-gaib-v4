import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  orchestrator: {
    run: (prompt: string): Promise<{ planId: string; summary: string }> =>
      ipcRenderer.invoke('orchestrator:run', prompt),
    openStreamWindow: (): Promise<boolean> => ipcRenderer.invoke('orchestrator:openStreamWindow'),
    onEvent: (callback: (event: unknown) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => {
        callback(payload)
      }
      ipcRenderer.on('orchestrator:event', listener)
      return () => ipcRenderer.removeListener('orchestrator:event', listener)
    }
  },
  settings: {
    get: (): Promise<unknown> => ipcRenderer.invoke('settings:get'),
    update: (partial: unknown): Promise<unknown> => ipcRenderer.invoke('settings:update', partial)
  },
  workspace: {
    pick: (): Promise<string | null> => ipcRenderer.invoke('workspace:pick'),
    listFiles: (depth = 3): Promise<unknown> => ipcRenderer.invoke('workspace:listFiles', depth),
    readFile: (path: string): Promise<string> => ipcRenderer.invoke('workspace:readFile', path)
  },
  projects: {
    list: (): Promise<unknown> => ipcRenderer.invoke('projects:list'),
    create: (payload: { name: string; workspacePath: string }): Promise<unknown> =>
      ipcRenderer.invoke('projects:create', payload),
    select: (projectId: string): Promise<unknown> => ipcRenderer.invoke('projects:select', projectId)
  },
  tools: {
    respond: (payload: { id: string; allow: boolean }): Promise<boolean> =>
      ipcRenderer.invoke('tool:respond', payload)
  },
  secrets: {
    get: (): Promise<unknown> => ipcRenderer.invoke('secrets:get'),
    update: (partial: unknown): Promise<unknown> => ipcRenderer.invoke('secrets:update', partial)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
