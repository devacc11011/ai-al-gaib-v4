import { useEffect, useMemo, useState } from 'react'

interface OrchestratorEventPayload {
  type: string
  timestamp: string
  data: unknown
}

function App(): React.JSX.Element {
  const [prompt, setPrompt] = useState('Run core pipeline check')
  const [events, setEvents] = useState<OrchestratorEventPayload[]>([])
  const [running, setRunning] = useState(false)
  const [settings, setSettings] = useState<SettingsShape | null>(null)
  const [saving, setSaving] = useState(false)
  const [secrets, setSecrets] = useState<SecretsShape | null>(null)
  const [secretsSaving, setSecretsSaving] = useState(false)

  useEffect(() => {
    const unsubscribe = window.api.orchestrator.onEvent((event) => {
      setEvents((prev) => [event, ...prev].slice(0, 50))
    })

    return () => unsubscribe()
  }, [])

  useEffect(() => {
    window.api.settings.get().then((data) => setSettings(data))
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
      </section>

      <section className="app-panel">
        <div className="app-label">Settings</div>
        {!settings && <div className="event-empty">Loading settings...</div>}
        {settings && (
          <div className="settings-grid">
            <label>
              Active Agent
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
              Claude Model
              <input
                type="text"
                value={settings.claude?.model ?? ''}
                onChange={(event) =>
                  setSettings({ ...settings, claude: { ...settings.claude, model: event.target.value } })
                }
              />
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
              <input
                type="text"
                value={settings.codex?.model ?? ''}
                onChange={(event) =>
                  setSettings({ ...settings, codex: { ...settings.codex, model: event.target.value } })
                }
              />
            </label>

            <label>
              Gemini Model
              <input
                type="text"
                value={settings.gemini?.model ?? ''}
                onChange={(event) =>
                  setSettings({ ...settings, gemini: { ...settings.gemini, model: event.target.value } })
                }
              />
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
