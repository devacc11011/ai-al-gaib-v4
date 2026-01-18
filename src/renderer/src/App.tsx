import { useEffect, useMemo, useRef, useState } from 'react'
import './monaco'
import Editor from '@monaco-editor/react'
import { claudeModels, codexModels, geminiModels } from './modelOptions'

interface OrchestratorEventPayload {
  type: string
  timestamp: string
  data: unknown
}

type UsageProviderKey = 'claude' | 'openai' | 'gemini' | 'other'

interface UsageStats {
  tasks: number
  inputChars: number
  outputChars: number
  durationMs: number
}

interface UsageSummary {
  providers: Record<UsageProviderKey, UsageStats>
  lastUpdated: string | null
}

function App(): React.JSX.Element {
  const isStreamView = new URLSearchParams(window.location.search).get('view') === 'stream'

  const [prompt, setPrompt] = useState('Run core pipeline check')
  const [events, setEvents] = useState<OrchestratorEventPayload[]>([])
  const [running, setRunning] = useState(false)
  const [settings, setSettings] = useState<SettingsShape | null>(null)
  const [saving, setSaving] = useState(false)
  const [secrets, setSecrets] = useState<SecretsShape | null>(null)
  const [secretsSaving, setSecretsSaving] = useState(false)
  const [plannerStreamText, setPlannerStreamText] = useState('')
  const [executorStreamText, setExecutorStreamText] = useState('')
  const [otherStreamText, setOtherStreamText] = useState('')
  const [projects, setProjects] = useState<ProjectShape[]>([])
  const [projectName, setProjectName] = useState('')
  const [projectWorkspace, setProjectWorkspace] = useState('')
  const [toolRequests, setToolRequests] = useState<
    Array<{
      id: string
      taskId: string
      agent: string
      toolName: string
      input: unknown
    }>
  >([])
  const [activePanel, setActivePanel] = useState<'command' | 'workspace' | 'plan'>('command')
  const [showSettings, setShowSettings] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [selectedEventIndex, setSelectedEventIndex] = useState<number | null>(null)
  const eventItemRefs = useRef<Array<HTMLDivElement | null>>([])
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceEntryShape[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string>('')
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [usageSummary, setUsageSummary] = useState<UsageSummary | null>(null)

  useEffect(() => {
    const unsubscribe = window.api.orchestrator.onEvent((event) => {
      setEvents((prev) => [event, ...prev].slice(0, 50))
      if (event.type === 'agent:stream' && typeof event.data === 'object' && event.data) {
        const payload = event.data as { text?: string; stage?: string }
        if (typeof payload.text === 'string') {
          if (payload.stage === 'planner') {
            setPlannerStreamText((prev) => `${prev}${payload.text}`)
          } else if (payload.stage === 'executor') {
            setExecutorStreamText((prev) => `${prev}${payload.text}`)
          } else {
            setOtherStreamText((prev) => `${prev}${payload.text}`)
          }
        }
      }
      if (event.type === 'tool:request' && event.data && typeof event.data === 'object') {
        const payload = event.data as {
          id: string
          taskId: string
          agent: string
          toolName: string
          input: unknown
        }
        setToolRequests((prev) => [...prev, payload])
      }
    })

    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (selectedEventIndex === null) return
    if (selectedEventIndex >= events.length) {
      setSelectedEventIndex(null)
      return
    }
    const node = eventItemRefs.current[selectedEventIndex]
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [events.length, selectedEventIndex])

  useEffect(() => {
    const unsubscribe = window.api.menu.onAction((payload) => {
      if (payload.type === 'open-settings') setShowSettings(true)
      if (payload.type === 'switch-project') handleClearProject()
      if (payload.type === 'run') handleRun()
      if (payload.type === 'open-stream') window.api.orchestrator.openStreamWindow()
    })
    return () => unsubscribe()
  }, [settings])

  useEffect(() => {
    window.api.settings.get().then((data) => {
      const normalized: SettingsShape = {
        ...data,
        planner: data.planner ?? { agent: data.activeAgent },
        executor: data.executor ?? { agent: data.activeAgent }
      }
      setSettings(normalized)
    })
  }, [])

  useEffect(() => {
    window.api.projects.list().then((data) => setProjects(data))
  }, [])

  useEffect(() => {
    window.api.secrets.get().then((data) => setSecrets(data))
  }, [])

  useEffect(() => {
    if (!showSettings) return
    window.api.usage.get().then((data) => setUsageSummary(data))
  }, [showSettings])

  useEffect(() => {
    if (activePanel !== 'workspace') return
    window.api.workspace.listFiles(3).then((data) => setWorkspaceFiles(data))
  }, [activePanel, settings?.activeProjectId])

  const statusLine = useMemo(() => {
    if (!events.length) return 'Idle'
    const latest = events[0]
    return `${latest.type} @ ${new Date(latest.timestamp).toLocaleTimeString()}`
  }, [events])

  const handleRun = async (): Promise<void> => {
    setRunning(true)
    try {
      await window.api.orchestrator.run(prompt)
    } finally {
      setRunning(false)
    }
  }

  const handleSaveSettings = async (): Promise<void> => {
    if (!settings) return
    setSaving(true)
    try {
      const updated = await window.api.settings.update(settings)
      setSettings(updated)
    } finally {
      setSaving(false)
    }
  }

  const handleResetUsage = async (): Promise<void> => {
    const updated = await window.api.usage.reset()
    setUsageSummary(updated)
  }

  const handleSaveSecrets = async (): Promise<void> => {
    if (!secrets) return
    setSecretsSaving(true)
    try {
      const updated = await window.api.secrets.update(secrets)
      setSecrets(updated)
    } finally {
      setSecretsSaving(false)
    }
  }

  const handlePickWorkspace = async (): Promise<void> => {
    if (!settings) return
    const picked = await window.api.workspace.pick()
    if (!picked) return
    setSettings({ ...settings, workspacePath: picked })
  }

  const handlePickProjectWorkspace = async (): Promise<void> => {
    const picked = await window.api.workspace.pick()
    if (!picked) return
    setProjectWorkspace(picked)
  }

  const handleCreateProject = async (): Promise<void> => {
    if (!projectName || !projectWorkspace) return
    const created = await window.api.projects.create({
      name: projectName,
      workspacePath: projectWorkspace
    })
    if (!created) return
    const list = await window.api.projects.list()
    setProjects(list)
    setProjectName('')
    setProjectWorkspace('')
  }

  const handleSelectProject = async (projectId: string): Promise<void> => {
    if (!settings) return
    const updated = await window.api.projects.select(projectId)
    setSettings(updated)
  }

  const handleClearProject = async (): Promise<void> => {
    if (!settings) return
    const updated = await window.api.settings.update({ activeProjectId: '' })
    setSettings(updated)
  }

  const handleToolDecision = async (id: string, allow: boolean): Promise<void> => {
    await window.api.tools.respond({ id, allow })
    setToolRequests((prev) => prev.filter((item) => item.id !== id))
  }

  const handlePanelClick = (panel: 'command' | 'workspace' | 'plan') => {
    if (panel === activePanel) {
      setSidebarCollapsed((collapsed) => !collapsed)
      return
    }
    setActivePanel(panel)
    setSidebarCollapsed(false)
  }

  const handleSelectFile = async (path: string): Promise<void> => {
    setSelectedFile(path)
    const content = await window.api.workspace.readFile(path)
    setFileContent(content)
  }

  const fileTree = useMemo(() => {
    type Node = {
      name: string
      path: string
      type: 'file' | 'dir'
      children: Node[]
    }
    const root: Node = { name: '', path: '', type: 'dir', children: [] }

    const ensureChild = (parent: Node, name: string, fullPath: string, type: 'file' | 'dir'): Node => {
      const existing = parent.children.find((child) => child.name === name)
      if (existing) return existing
      const node: Node = { name, path: fullPath, type, children: [] }
      parent.children.push(node)
      return node
    }

    const sorted = [...workspaceFiles].sort((a, b) => a.path.localeCompare(b.path))
    for (const entry of sorted) {
      const parts = entry.path.split('/').filter(Boolean)
      let current = root
      let currentPath = ''
      parts.forEach((part, index) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part
        const isLeaf = index === parts.length - 1
        const nodeType: 'file' | 'dir' = isLeaf ? entry.type : 'dir'
        current = ensureChild(current, part, currentPath, nodeType)
      })
    }

    const sortTree = (node: Node) => {
      node.children.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      node.children.forEach(sortTree)
    }
    sortTree(root)

    return root.children
  }, [workspaceFiles])

  const toggleDir = (path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const resolveModelValue = (value: string | undefined, options: { value: string }[]): string => {
    if (!value) return ''
    return options.some((option) => option.value === value) ? value : 'custom'
  }

  const modelOptionsForAgent = (agent: SettingsShape['activeAgent']) => {
    if (agent === 'claude-code') return claudeModels
    if (agent === 'codex') return codexModels
    if (agent === 'gemini-cli') return geminiModels
    return []
  }

  const estimateTokens = (chars: number): number => Math.ceil(chars / 4)

  const formatUsd = (value: number | null): string => {
    if (value === null || Number.isNaN(value)) return '—'
    return `$${value.toFixed(4)}`
  }

  const calcCost = (provider: keyof NonNullable<SettingsShape['usagePricing']>, stats: UsageStats): number | null => {
    const pricing = settings?.usagePricing?.[provider]
    if (!pricing?.inputPerMillionUsd && !pricing?.outputPerMillionUsd) return null
    const inputTokens = estimateTokens(stats.inputChars)
    const outputTokens = estimateTokens(stats.outputChars)
    const inputCost =
      pricing.inputPerMillionUsd !== undefined
        ? (inputTokens / 1_000_000) * pricing.inputPerMillionUsd
        : 0
    const outputCost =
      pricing.outputPerMillionUsd !== undefined
        ? (outputTokens / 1_000_000) * pricing.outputPerMillionUsd
        : 0
    return inputCost + outputCost
  }

  const updatePricing = (
    provider: keyof NonNullable<SettingsShape['usagePricing']>,
    field: 'inputPerMillionUsd' | 'outputPerMillionUsd',
    value: string
  ): void => {
    if (!settings) return
    const parsed = value.trim() === '' ? undefined : Number(value)
    setSettings({
      ...settings,
      usagePricing: {
        ...settings.usagePricing,
        [provider]: {
          ...settings.usagePricing?.[provider],
          [field]: Number.isFinite(parsed) ? parsed : undefined
        }
      }
    })
  }

  const currentProject = useMemo(() => {
    if (!settings?.activeProjectId) return null
    return projects.find((project) => project.id === settings.activeProjectId) ?? null
  }, [projects, settings])

  if (isStreamView) {
    const plannerOutput = plannerStreamText || 'Waiting for planner stream...'
    const executorOutput = executorStreamText || 'Waiting for executor stream...'
    const otherOutput = otherStreamText || 'Waiting for other stream...'
    return (
      <div className="stream-shell">
        <header className="app-header">
          <div>
            <div className="app-title">Agent Stream</div>
            <div className="app-subtitle">Live output</div>
          </div>
        </header>
        <div className="stream-grid">
          <section className="stream-panel">
            <div className="stream-label">Planner</div>
            <pre className="stream-output">{plannerOutput}</pre>
          </section>
          <section className="stream-panel">
            <div className="stream-label">Executor</div>
            <pre className="stream-output">{executorOutput}</pre>
          </section>
          <section className="stream-panel stream-panel-full">
            <div className="stream-label">Other</div>
            <pre className="stream-output">{otherOutput}</pre>
          </section>
        </div>
      </div>
    )
  }

  if (settings && !settings.activeProjectId) {
    return (
    <div className={`app-shell${activePanel === 'workspace' ? ' app-shell-wide' : ''}`}>
        <header className="app-header">
          <div>
            <div className="app-title">Select Project</div>
            <div className="app-subtitle">Choose a workspace to get started</div>
          </div>
        </header>

        <section className="app-panel">
          <div className="app-label">Recent Projects</div>
          {projects.length === 0 && <div className="event-empty">No projects yet.</div>}
          {projects.map((project) => (
            <div key={project.id} className="project-row">
              <div>
                <div className="project-name">{project.name}</div>
                <div className="project-path">{project.workspacePath}</div>
              </div>
              <button type="button" onClick={() => handleSelectProject(project.id)}>
                Open
              </button>
            </div>
          ))}
        </section>

        <section className="app-panel">
          <div className="app-label">Create Project</div>
          <div className="settings-grid">
            <label>
              Project Name
              <input
                type="text"
                placeholder="Project name"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
              />
            </label>

            <label>
              Workspace
              <div className="inline-row">
                <input
                  type="text"
                  placeholder="/path/to/project"
                  value={projectWorkspace}
                  onChange={(event) => setProjectWorkspace(event.target.value)}
                />
                <button type="button" onClick={handlePickProjectWorkspace}>
                  Pick...
                </button>
              </div>
            </label>

            <button type="button" onClick={handleCreateProject}>
              Create Project
            </button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className={sidebarCollapsed ? 'app-root sidebar-collapsed' : 'app-root'}>
      <aside className="activity-bar">
        <button
          className={activePanel === 'command' ? 'active icon-button' : 'icon-button'}
          onClick={() => handlePanelClick('command')}
          title="Command"
        >
          ▶
        </button>
        <button
          className={activePanel === 'workspace' ? 'active icon-button' : 'icon-button'}
          onClick={() => handlePanelClick('workspace')}
          title="Workspace"
        >
          📁
        </button>
        <button
          className={activePanel === 'plan' ? 'active icon-button' : 'icon-button'}
          onClick={() => handlePanelClick('plan')}
          title="Plan/Tasks"
        >
          ☰
        </button>
      </aside>

      <aside className="sidebar">
        <div className="sidebar-header">Workspace</div>
        <div className="sidebar-card compact">
          <div className="sidebar-title">{currentProject?.name ?? 'Untitled'}</div>
          <div className="sidebar-subtitle">{currentProject?.workspacePath ?? '—'}</div>
        </div>

        {activePanel === 'plan' && (
          <>
            <div className="sidebar-header">Plan & Tasks</div>
            <div className="sidebar-card">
              {events.length === 0 && <div className="event-empty">No events yet.</div>}
              {events.map((event, index) => (
                <button
                  key={`${event.type}-${index}`}
                  type="button"
                  className={`sidebar-event${selectedEventIndex === index ? ' selected' : ''}`}
                  onClick={() => setSelectedEventIndex(index)}
                >
                  <div className="event-type">{event.type}</div>
                  <div className="event-time">{new Date(event.timestamp).toLocaleTimeString()}</div>
                </button>
              ))}
            </div>
          </>
        )}

        {activePanel === 'workspace' && (
          <>
            <div className="sidebar-header">Workspace</div>
            <div className="sidebar-card">
              {workspaceFiles.length === 0 && <div className="event-empty">No files found.</div>}
              <div className="file-list">
                {fileTree.map((node) => (
                  <TreeNodeView
                    key={node.path}
                    node={node}
                    expandedDirs={expandedDirs}
                    selectedFile={selectedFile}
                    onToggleDir={toggleDir}
                    onSelectFile={handleSelectFile}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </aside>

      <div className="main-frame">
        <header className="top-bar">
          <div className="top-left">
            <div className="app-title">Ai AL GAIB</div>
            <div className="app-subtitle">Workspace · Planner · Executor</div>
          </div>
          <div className="top-right">
            <div className="top-project">
              <select
                value={settings?.activeProjectId ?? ''}
                onChange={(event) => {
                  const value = event.target.value
                  if (!value) {
                    handleClearProject()
                  } else {
                    handleSelectProject(value)
                  }
                }}
              >
                <option value="">Select project...</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="app-status">{statusLine}</div>
            <button type="button" onClick={() => setShowSettings(true)}>
              Settings
            </button>
          </div>
        </header>

        <main className="main-content">
          {activePanel === 'command' && (
            <section className="panel-card">
              <div className="panel-title">Command</div>
              <label className="app-label" htmlFor="prompt-main">
                Prompt
              </label>
              <textarea
                id="prompt-main"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={6}
              />
              <div className="panel-actions">
                <button type="button" onClick={handleRun} disabled={running}>
                  {running ? 'Running...' : 'Run Core Pipeline'}
                </button>
                <button type="button" onClick={() => window.api.orchestrator.openStreamWindow()}>
                  Open Stream Window
                </button>
              </div>
            </section>
          )}

          {activePanel === 'workspace' && (
            <section className="panel-card">
              <div className="panel-title">File Preview</div>
              {selectedFile ? (
                <Editor
                  height="70vh"
                  language={selectedFile.split('.').pop() || 'plaintext'}
                  value={fileContent}
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    fontSize: 12,
                    lineNumbers: 'on'
                  }}
                  theme="vs-dark"
                />
              ) : (
                <div className="event-empty">Select a file to preview.</div>
              )}
            </section>
          )}

          {activePanel === 'plan' && (
            <section className="panel-card">
              <div className="panel-title">Timeline</div>
              <div className="event-list">
                {events.length === 0 && <div className="event-empty">No events yet.</div>}
                {events.map((event, index) => (
                  <div
                    key={`${event.type}-${index}`}
                    className={`event-item${selectedEventIndex === index ? ' selected' : ''}`}
                    ref={(el) => {
                      eventItemRefs.current[index] = el
                    }}
                  >
                    <div className="event-type">{event.type}</div>
                    <div className="event-time">{new Date(event.timestamp).toLocaleTimeString()}</div>
                    <pre>{JSON.stringify(event.data, null, 2)}</pre>
                  </div>
                ))}
              </div>
            </section>
          )}
        </main>
      </div>

      {toolRequests.length > 0 && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="app-label">Tool Permission</div>
            {toolRequests.map((req) => (
              <div key={req.id} className="tool-request">
                <div className="tool-title">
                  {req.agent} request: {req.toolName}
                </div>
                <div className="tool-meta">task: {req.taskId}</div>
                <pre className="tool-input">{JSON.stringify(req.input, null, 2)}</pre>
                <div className="tool-actions">
                  <button type="button" onClick={() => handleToolDecision(req.id, true)}>
                    Allow
                  </button>
                  <button type="button" onClick={() => handleToolDecision(req.id, false)}>
                    Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showSettings && (
        <div className="settings-overlay">
          <div className="settings-card">
            <header className="settings-header">
              <div className="panel-title">Settings</div>
              <button type="button" onClick={() => setShowSettings(false)}>
                Close
              </button>
            </header>
            <div className="settings-columns">
              <section className="settings-section">
                <div className="app-label">Runtime</div>
                {!settings && <div className="event-empty">Loading settings...</div>}
                {settings && (
                  <div className="settings-grid">
                    <label>
                      Active Agent (fallback)
                      <select
                        value={settings.activeAgent}
                        onChange={(event) =>
                          setSettings({
                            ...settings,
                            activeAgent: event.target.value as SettingsShape['activeAgent']
                          })
                        }
                      >
                        <option value="claude-code">claude-code</option>
                        <option value="codex">codex</option>
                        <option value="gemini-cli">gemini-cli</option>
                      </select>
                    </label>

                    <label>
                      Workspace Path
                      <div className="inline-row">
                        <input
                          type="text"
                          placeholder="/path/to/workspace"
                          value={settings.workspacePath ?? ''}
                          onChange={(event) =>
                            setSettings({ ...settings, workspacePath: event.target.value })
                          }
                        />
                        <button type="button" onClick={handlePickWorkspace}>
                          Pick...
                        </button>
                      </div>
                    </label>

                    <label>
                      Planner Agent
                      <select
                        value={settings.planner?.agent ?? settings.activeAgent}
                        onChange={(event) =>
                          setSettings({
                            ...settings,
                            planner: {
                              ...settings.planner,
                              agent: event.target.value as SettingsShape['activeAgent']
                            }
                          })
                        }
                      >
                        <option value="claude-code">claude-code</option>
                        <option value="codex">codex</option>
                        <option value="gemini-cli">gemini-cli</option>
                      </select>
                    </label>

                    <label>
                      Planner Model
                      <select
                        value={resolveModelValue(
                          settings.planner?.model,
                          modelOptionsForAgent(settings.planner?.agent ?? settings.activeAgent)
                        )}
                        onChange={(event) => {
                          const value = event.target.value
                          setSettings({
                            ...settings,
                            planner: {
                              ...settings.planner,
                              model: value === 'custom' ? '' : value
                            }
                          })
                        }}
                      >
                        <option value="">(default)</option>
                        {modelOptionsForAgent(settings.planner?.agent ?? settings.activeAgent).map((model) => (
                          <option key={model.value} value={model.value}>
                            {model.label}
                          </option>
                        ))}
                        <option value="custom">Custom...</option>
                      </select>
                      {resolveModelValue(
                        settings.planner?.model,
                        modelOptionsForAgent(settings.planner?.agent ?? settings.activeAgent)
                      ) === 'custom' && (
                        <input
                          type="text"
                          placeholder="custom model id"
                          value={settings.planner?.model ?? ''}
                          onChange={(event) =>
                            setSettings({
                              ...settings,
                              planner: { ...settings.planner, model: event.target.value }
                            })
                          }
                        />
                      )}
                    </label>

                    <label>
                      Executor Agent
                      <select
                        value={settings.executor?.agent ?? settings.activeAgent}
                        onChange={(event) =>
                          setSettings({
                            ...settings,
                            executor: {
                              ...settings.executor,
                              agent: event.target.value as SettingsShape['activeAgent']
                            }
                          })
                        }
                      >
                        <option value="claude-code">claude-code</option>
                        <option value="codex">codex</option>
                        <option value="gemini-cli">gemini-cli</option>
                      </select>
                    </label>

                    <label>
                      Executor Model
                      <select
                        value={resolveModelValue(
                          settings.executor?.model,
                          modelOptionsForAgent(settings.executor?.agent ?? settings.activeAgent)
                        )}
                        onChange={(event) => {
                          const value = event.target.value
                          setSettings({
                            ...settings,
                            executor: {
                              ...settings.executor,
                              model: value === 'custom' ? '' : value
                            }
                          })
                        }}
                      >
                        <option value="">(default)</option>
                        {modelOptionsForAgent(settings.executor?.agent ?? settings.activeAgent).map((model) => (
                          <option key={model.value} value={model.value}>
                            {model.label}
                          </option>
                        ))}
                        <option value="custom">Custom...</option>
                      </select>
                      {resolveModelValue(
                        settings.executor?.model,
                        modelOptionsForAgent(settings.executor?.agent ?? settings.activeAgent)
                      ) === 'custom' && (
                        <input
                          type="text"
                          placeholder="custom model id"
                          value={settings.executor?.model ?? ''}
                          onChange={(event) =>
                            setSettings({
                              ...settings,
                              executor: { ...settings.executor, model: event.target.value }
                            })
                          }
                        />
                      )}
                    </label>

                    <button type="button" onClick={handleSaveSettings} disabled={saving}>
                      {saving ? 'Saving...' : 'Save Settings'}
                    </button>
                  </div>
                )}
              </section>

              <section className="settings-section">
                <div className="app-label">API Keys</div>
                {!secrets && <div className="event-empty">Loading keys...</div>}
                {secrets && (
                  <div className="settings-grid">
                    <label>
                      Anthropic API Key
                      <input
                        type="password"
                        placeholder="sk-ant-..."
                        value={secrets.anthropicApiKey ?? ''}
                        onChange={(event) =>
                          setSecrets({ ...secrets, anthropicApiKey: event.target.value })
                        }
                      />
                    </label>

                    <label>
                      OpenAI API Key
                      <input
                        type="password"
                        placeholder="sk-..."
                        value={secrets.openaiApiKey ?? ''}
                        onChange={(event) =>
                          setSecrets({ ...secrets, openaiApiKey: event.target.value })
                        }
                      />
                    </label>

                    <button type="button" onClick={handleSaveSecrets} disabled={secretsSaving}>
                      {secretsSaving ? 'Saving...' : 'Save Keys'}
                    </button>
                  </div>
                )}
              </section>

              <section className="settings-section">
                <div className="app-label">Usage & Cost (est.)</div>
                {!usageSummary && <div className="event-empty">Loading usage...</div>}
                {usageSummary && (
                  <div className="settings-grid">
                    <div className="usage-grid">
                      {(['claude', 'openai', 'gemini'] as const).map((provider) => {
                        const stats = usageSummary.providers[provider]
                        const inputTokens = estimateTokens(stats.inputChars)
                        const outputTokens = estimateTokens(stats.outputChars)
                        const cost = calcCost(provider, stats)
                        const label =
                          provider === 'openai'
                            ? 'OpenAI (Codex)'
                            : provider.charAt(0).toUpperCase() + provider.slice(1)

                        return (
                          <div key={provider} className="usage-card">
                            <div className="usage-title">{label}</div>
                            <div className="usage-row">
                              <span>Tasks</span>
                              <span>{stats.tasks}</span>
                            </div>
                            <div className="usage-row">
                              <span>Input tokens (est)</span>
                              <span>{inputTokens.toLocaleString()}</span>
                            </div>
                            <div className="usage-row">
                              <span>Output tokens (est)</span>
                              <span>{outputTokens.toLocaleString()}</span>
                            </div>
                            <div className="usage-row">
                              <span>Cost (est)</span>
                              <span>{formatUsd(cost)}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    <div className="settings-grid">
                      <label>
                        Claude input $/1M
                        <input
                          type="number"
                          step="0.01"
                          placeholder="e.g. 3.00"
                          value={settings?.usagePricing?.claude?.inputPerMillionUsd ?? ''}
                          onChange={(event) => updatePricing('claude', 'inputPerMillionUsd', event.target.value)}
                        />
                      </label>
                      <label>
                        Claude output $/1M
                        <input
                          type="number"
                          step="0.01"
                          placeholder="e.g. 15.00"
                          value={settings?.usagePricing?.claude?.outputPerMillionUsd ?? ''}
                          onChange={(event) => updatePricing('claude', 'outputPerMillionUsd', event.target.value)}
                        />
                      </label>
                      <label>
                        OpenAI input $/1M
                        <input
                          type="number"
                          step="0.01"
                          placeholder="e.g. 1.00"
                          value={settings?.usagePricing?.openai?.inputPerMillionUsd ?? ''}
                          onChange={(event) => updatePricing('openai', 'inputPerMillionUsd', event.target.value)}
                        />
                      </label>
                      <label>
                        OpenAI output $/1M
                        <input
                          type="number"
                          step="0.01"
                          placeholder="e.g. 3.00"
                          value={settings?.usagePricing?.openai?.outputPerMillionUsd ?? ''}
                          onChange={(event) => updatePricing('openai', 'outputPerMillionUsd', event.target.value)}
                        />
                      </label>
                      <label>
                        Gemini input $/1M
                        <input
                          type="number"
                          step="0.01"
                          placeholder="e.g. 0.50"
                          value={settings?.usagePricing?.gemini?.inputPerMillionUsd ?? ''}
                          onChange={(event) => updatePricing('gemini', 'inputPerMillionUsd', event.target.value)}
                        />
                      </label>
                      <label>
                        Gemini output $/1M
                        <input
                          type="number"
                          step="0.01"
                          placeholder="e.g. 1.50"
                          value={settings?.usagePricing?.gemini?.outputPerMillionUsd ?? ''}
                          onChange={(event) => updatePricing('gemini', 'outputPerMillionUsd', event.target.value)}
                        />
                      </label>
                    </div>

                    <div className="usage-meta">
                      <div className="event-empty">
                        Tokens are estimated from characters (chars / 4). Set pricing to estimate cost.
                      </div>
                      <button type="button" onClick={handleResetUsage}>
                        Reset Usage
                      </button>
                    </div>
                  </div>
                )}
              </section>

            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App

type TreeNode = {
  name: string
  path: string
  type: 'file' | 'dir'
  children: TreeNode[]
}

function TreeNodeView({
  node,
  expandedDirs,
  selectedFile,
  onToggleDir,
  onSelectFile
}: {
  node: TreeNode
  expandedDirs: Set<string>
  selectedFile: string | null
  onToggleDir: (path: string) => void
  onSelectFile: (path: string) => void
}): React.JSX.Element {
  const isDir = node.type === 'dir'
  const expanded = isDir && expandedDirs.has(node.path)
  const hasChildren = isDir && node.children.length > 0

  return (
    <div className="tree-node">
      <button
        type="button"
        className={selectedFile === node.path ? 'file-item active' : 'file-item'}
        onClick={() => {
          if (isDir) onToggleDir(node.path)
          else onSelectFile(node.path)
        }}
      >
        <span className="file-caret">{isDir ? (expanded ? 'v' : '>') : ''}</span>
        <span className={isDir ? 'file-icon dir' : 'file-icon file'} aria-hidden />
        <span className="file-name">{node.name}</span>
      </button>
      {hasChildren && expanded && (
        <div className="tree-children">
          {node.children.map((child) => (
            <TreeNodeView
              key={child.path}
              node={child}
              expandedDirs={expandedDirs}
              selectedFile={selectedFile}
              onToggleDir={onToggleDir}
              onSelectFile={onSelectFile}
            />
          ))}
        </div>
      )}
    </div>
  )
}
