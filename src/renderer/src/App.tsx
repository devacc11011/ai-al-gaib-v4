import { useEffect, useMemo, useState } from 'react'
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

  useEffect(() => {
    const unsubscribe = window.api.orchestrator.onEvent((event) => {
      setEvents((prev) => [event, ...prev].slice(0, 50))
      if (event.type === 'agent:stream' && typeof event.data === 'object' && event.data) {
        const payload = event.data as { text?: string }
        if (typeof payload.text === 'string') {
          setStreamText((prev) => `${prev}${payload.text}`)
        }
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
    window.api.secrets.get().then((data) => setSecrets(data))
  }, [])

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

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <div className="app-title">AI Orchestrator Core</div>
          <div className="app-subtitle">Planner → Executor → Result</div>
        </div>
        <div className="app-status">{statusLine}</div>
      </header>

      <section className="app-panel">
        <label className="app-label" htmlFor="prompt">
          Prompt
        </label>
        <textarea
          id="prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={4}
        />
        <button type="button" onClick={handleRun} disabled={running}>
          {running ? 'Running...' : 'Run Core Pipeline'}
        </button>
        <button type="button" onClick={() => window.api.orchestrator.openStreamWindow()}>
          Open Stream Window
        </button>
      </section>

      <section className="app-panel">
        <div className="app-label">Settings</div>
        {!settings && <div className="event-empty">Loading settings...</div>}
        {settings && (
          <div className="settings-grid">
            <label>
              Active Agent (fallback)
              <select
                value={settings.activeAgent}
                onChange={(event) =>
                  setSettings({ ...settings, activeAgent: event.target.value as SettingsShape['activeAgent'] })
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
                  Pick…
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
                    planner: { ...settings.planner, agent: event.target.value as SettingsShape['activeAgent'] }
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
                    executor: { ...settings.executor, agent: event.target.value as SettingsShape['activeAgent'] }
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
                    setSettings({ ...settings, claude: { ...settings.claude, model: event.target.value } })
                  }
                />
              )}
            </label>

            <label>
              Claude Permission
              <select
                value={settings.claude?.permissionMode ?? 'acceptEdits'}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    claude: {
                      ...settings.claude,
                      permissionMode: event.target.value as SettingsShape['claude']['permissionMode']
                    }
                  })
                }
              >
                <option value="default">default</option>
                <option value="acceptEdits">acceptEdits</option>
                <option value="bypassPermissions">bypassPermissions</option>
              </select>
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
                    setSettings({ ...settings, codex: { ...settings.codex, model: event.target.value } })
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
                    setSettings({ ...settings, gemini: { ...settings.gemini, model: event.target.value } })
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

            <button type="button" onClick={handleSaveSettings} disabled={saving}>
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        )}
      </section>

      <section className="app-panel">
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
                onChange={(event) => setSecrets({ ...secrets, openaiApiKey: event.target.value })}
              />
            </label>

            <label>
              Gemini API Key
              <input
                type="password"
                placeholder="AIza..."
                value={secrets.geminiApiKey ?? ''}
                onChange={(event) => setSecrets({ ...secrets, geminiApiKey: event.target.value })}
              />
            </label>

            <button type="button" onClick={handleSaveSecrets} disabled={secretsSaving}>
              {secretsSaving ? 'Saving...' : 'Save Keys'}
            </button>
          </div>
        )}
      </section>

      <section className="app-panel">
        <div className="app-label">Events</div>
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
    </div>
  )
}

export default App
