import { useEffect, useMemo, useState } from 'react'
import Editor from '@monaco-editor/react'
import { claudeModels, codexModels, geminiModels } from './modelOptions'

interface OrchestratorEventPayload {
  type: string
  timestamp: string
  data: unknown
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
  const [streamText, setStreamText] = useState('')
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
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceEntryShape[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string>('')

  useEffect(() => {
    const unsubscribe = window.api.orchestrator.onEvent((event) => {
      setEvents((prev) => [event, ...prev].slice(0, 50))
      if (event.type === 'agent:stream' && typeof event.data === 'object' && event.data) {
        const payload = event.data as { text?: string }
        if (typeof payload.text === 'string') {
          setStreamText((prev) => `${prev}${payload.text}`)
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

  const handleSelectFile = async (path: string): Promise<void> => {
    setSelectedFile(path)
    const content = await window.api.workspace.readFile(path)
    setFileContent(content)
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

  const currentProject = useMemo(() => {
    if (!settings?.activeProjectId) return null
    return projects.find((project) => project.id === settings.activeProjectId) ?? null
  }, [projects, settings])

  if (isStreamView) {
    return (
      <div className="stream-shell">
        <header className="app-header">
          <div>
            <div className="app-title">Agent Stream</div>
            <div className="app-subtitle">Live output</div>
          </div>
        </header>
        <pre className="stream-output">{streamText || 'Waiting for stream...'}</pre>
      </div>
    )
  }

  if (settings && !settings.activeProjectId) {
    return (
      <div className="app-shell">
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
    <div className="app-root">
      <aside className="activity-bar">
        <button
          className={activePanel === 'command' ? 'active' : ''}
          onClick={() => setActivePanel('command')}
          title="Command"
        >
          CMD
        </button>
        <button
          className={activePanel === 'workspace' ? 'active' : ''}
          onClick={() => setActivePanel('workspace')}
          title="Workspace"
        >
          FS
        </button>
        <button
          className={activePanel === 'plan' ? 'active' : ''}
          onClick={() => setActivePanel('plan')}
          title="Plan/Tasks"
        >
          PL
        </button>
      </aside>

      <aside className="sidebar">
        {activePanel === 'command' && (
          <>
            <div className="sidebar-header">Workspace</div>
            <div className="sidebar-card">
              <div className="sidebar-title">{currentProject?.name ?? 'Untitled'}</div>
              <div className="sidebar-subtitle">{currentProject?.workspacePath ?? '—'}</div>
              <button type="button" onClick={handleClearProject}>
                Switch Project
              </button>
            </div>

            <div className="sidebar-header">Command</div>
            <div className="sidebar-card">
              <label className="app-label" htmlFor="prompt">
                Prompt
              </label>
              <textarea
                id="prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={4}
              />
              <div className="panel-actions">
                <button type="button" onClick={handleRun} disabled={running}>
                  {running ? 'Running...' : 'Run Core Pipeline'}
                </button>
                <button type="button" onClick={() => window.api.orchestrator.openStreamWindow()}>
                  Stream Window
                </button>
              </div>
            </div>
          </>
        )}

        {activePanel === 'plan' && (
          <>
            <div className="sidebar-header">Plan & Tasks</div>
            <div className="sidebar-card">
              {events.length === 0 && <div className="event-empty">No events yet.</div>}
              {events.map((event, index) => (
                <div key={`${event.type}-${index}`} className="sidebar-event">
                  <div className="event-type">{event.type}</div>
                  <div className="event-time">{new Date(event.timestamp).toLocaleTimeString()}</div>
                </div>
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
                {workspaceFiles.map((entry) => (
                  <button
                    key={`${entry.type}-${entry.path}`}
                    type="button"
                    className={selectedFile === entry.path ? 'file-item active' : 'file-item'}
                    onClick={() => entry.type === 'file' && handleSelectFile(entry.path)}
                  >
                    <span className="file-kind">{entry.type === 'dir' ? 'DIR' : 'FILE'}</span>
                    <span className="file-name">{entry.path}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </aside>

      <div className="main-frame">
        <header className="top-bar">
          <div className="top-left">
            <div className="app-title">AI Orchestrator</div>
            <div className="app-subtitle">Workspace · Planner · Executor</div>
          </div>
          <div className="top-right">
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
                  <div key={`${event.type}-${index}`} className="event-item">
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
                        <option value="mock">mock</option>
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
                        <option value="mock">mock</option>
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
                        <option value="mock">mock</option>
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

                    <label>
                      Gemini API Key
                      <input
                        type="password"
                        placeholder="AIza..."
                        value={secrets.geminiApiKey ?? ''}
                        onChange={(event) =>
                          setSecrets({ ...secrets, geminiApiKey: event.target.value })
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
                <div className="app-label">Model Defaults</div>
                {settings && (
                  <div className="settings-grid">
                    <label>
                      Claude Model
                      <select
                        value={resolveModelValue(settings.claude?.model, claudeModels)}
                        onChange={(event) => {
                          const value = event.target.value
                          setSettings({
                            ...settings,
                            claude: { ...settings.claude, model: value === 'custom' ? '' : value }
                          })
                        }}
                      >
                        <option value="">(default)</option>
                        {claudeModels.map((model) => (
                          <option key={model.value} value={model.value}>
                            {model.label}
                          </option>
                        ))}
                        <option value="custom">Custom...</option>
                      </select>
                      {resolveModelValue(settings.claude?.model, claudeModels) === 'custom' && (
                        <input
                          type="text"
                          placeholder="custom model id"
                          value={settings.claude?.model ?? ''}
                          onChange={(event) =>
                            setSettings({
                              ...settings,
                              claude: { ...settings.claude, model: event.target.value }
                            })
                          }
                        />
                      )}
                    </label>

                    <label>
                      Codex Model
                      <select
                        value={resolveModelValue(settings.codex?.model, codexModels)}
                        onChange={(event) => {
                          const value = event.target.value
                          setSettings({
                            ...settings,
                            codex: { ...settings.codex, model: value === 'custom' ? '' : value }
                          })
                        }}
                      >
                        <option value="">(default)</option>
                        {codexModels.map((model) => (
                          <option key={model.value} value={model.value}>
                            {model.label}
                          </option>
                        ))}
                        <option value="custom">Custom...</option>
                      </select>
                      {resolveModelValue(settings.codex?.model, codexModels) === 'custom' && (
                        <input
                          type="text"
                          placeholder="custom model id"
                          value={settings.codex?.model ?? ''}
                          onChange={(event) =>
                            setSettings({
                              ...settings,
                              codex: { ...settings.codex, model: event.target.value }
                            })
                          }
                        />
                      )}
                    </label>

                    <label>
                      Gemini Model
                      <select
                        value={resolveModelValue(settings.gemini?.model, geminiModels)}
                        onChange={(event) => {
                          const value = event.target.value
                          setSettings({
                            ...settings,
                            gemini: { ...settings.gemini, model: value === 'custom' ? '' : value }
                          })
                        }}
                      >
                        <option value="">(default)</option>
                        {geminiModels.map((model) => (
                          <option key={model.value} value={model.value}>
                            {model.label}
                          </option>
                        ))}
                        <option value="custom">Custom...</option>
                      </select>
                      {resolveModelValue(settings.gemini?.model, geminiModels) === 'custom' && (
                        <input
                          type="text"
                          placeholder="custom model id"
                          value={settings.gemini?.model ?? ''}
                          onChange={(event) =>
                            setSettings({
                              ...settings,
                              gemini: { ...settings.gemini, model: event.target.value }
                            })
                          }
                        />
                      )}
                    </label>

                    <label>
                      Gemini Output
                      <select
                        value={settings.gemini?.outputFormat ?? 'stream-json'}
                        onChange={(event) =>
                          setSettings({
                            ...settings,
                            gemini: {
                              ...settings.gemini,
                              outputFormat: event.target.value as SettingsShape['gemini']['outputFormat']
                            }
                          })
                        }
                      >
                        <option value="stream-json">stream-json</option>
                        <option value="json">json</option>
                        <option value="jsonl">jsonl</option>
                      </select>
                    </label>
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
