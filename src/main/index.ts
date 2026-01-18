import { app, shell, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { Orchestrator } from './orchestrator/Orchestrator'

function createWindow(search?: string): BrowserWindow {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    const base = process.env['ELECTRON_RENDERER_URL']
    const url = search ? `${base}?${search}` : base
    mainWindow.loadURL(url)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'), search ? { search } : undefined)
  }

  return mainWindow
}

let orchestrator: Orchestrator | null = null
let unsubscribeEvents: (() => void) | null = null
let streamWindow: BrowserWindow | null = null

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  app.setName('Ai AL GAIB')
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const mainWindow = createWindow()
  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Settings',
          click: () => mainWindow.webContents.send('menu:action', { type: 'open-settings' })
        },
        {
          label: 'Switch Project',
          click: () => mainWindow.webContents.send('menu:action', { type: 'switch-project' })
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Run',
      submenu: [
        {
          label: 'Run Core Pipeline',
          click: () => mainWindow.webContents.send('menu:action', { type: 'run' })
        },
        {
          label: 'Open Stream Window',
          click: () => mainWindow.webContents.send('menu:action', { type: 'open-stream' })
        }
      ]
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Documentation',
          click: () => shell.openExternal('https://electron-vite.org/')
        }
      ]
    }
  ])
  Menu.setApplicationMenu(menu)
  orchestrator = new Orchestrator(process.cwd())

  unsubscribeEvents?.()
  unsubscribeEvents = orchestrator.onEvent((event) => {
    mainWindow.webContents.send('orchestrator:event', event)
    streamWindow?.webContents.send('orchestrator:event', event)
  })

  ipcMain.handle('orchestrator:run', async (_event, prompt: string) => {
    if (!orchestrator) return { planId: 'none', summary: 'Orchestrator not ready.' }
    return orchestrator.run(prompt)
  })

  ipcMain.handle('orchestrator:openStreamWindow', async () => {
    if (streamWindow && !streamWindow.isDestroyed()) {
      streamWindow.focus()
      return true
    }
    streamWindow = createWindow('view=stream')
    streamWindow.on('closed', () => {
      streamWindow = null
    })
    return true
  })

  ipcMain.handle('settings:get', async () => {
    if (!orchestrator) return null
    return orchestrator.getSettings()
  })

  ipcMain.handle('settings:update', async (_event, partial) => {
    if (!orchestrator) return null
    return orchestrator.updateSettings(partial)
  })

  ipcMain.handle('workspace:pick', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('projects:list', async () => {
    if (!orchestrator) return []
    return orchestrator.listProjects()
  })

  ipcMain.handle('projects:create', async (_event, payload: { name: string; workspacePath: string }) => {
    if (!orchestrator) return null
    return orchestrator.createProject(payload.name, payload.workspacePath)
  })

  ipcMain.handle('projects:select', async (_event, projectId: string) => {
    if (!orchestrator) return null
    return orchestrator.selectProject(projectId)
  })

  ipcMain.handle('tool:respond', async (_event, payload: { id: string; allow: boolean }) => {
    if (!orchestrator) return false
    orchestrator.resolveToolApproval(payload.id, payload.allow)
    return true
  })

  ipcMain.handle('workspace:listFiles', async (_event, depth: number) => {
    if (!orchestrator) return []
    return orchestrator.listWorkspaceFiles(depth)
  })

  ipcMain.handle('workspace:readFile', async (_event, path: string) => {
    if (!orchestrator) return ''
    return orchestrator.readWorkspaceFile(path)
  })

  ipcMain.handle('secrets:get', async () => {
    if (!orchestrator) return null
    return orchestrator.getSecrets()
  })

  ipcMain.handle('secrets:update', async (_event, partial) => {
    if (!orchestrator) return null
    return orchestrator.updateSecrets(partial)
  })

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
