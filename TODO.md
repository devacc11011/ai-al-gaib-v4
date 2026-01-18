# TODO

## 1) Agent adapters (Claude/Codex/Gemini)
- Add Claude adapter using `@anthropic-ai/claude-agent-sdk` (streaming + hooks + permissions)
- Add Codex adapter using `@openai/codex-sdk` (thread start/resume)
- Add Gemini adapter using CLI spawn + JSONL parsing
- Implement availability checks per adapter
- Implement cancellation (optional)
- Add adapter registry/factory and tests

## 2) Planner + DAG execution loop
- Expand Planner to produce multi-task DAG from a user prompt
- Add TaskGraph dependency validation and cycle detection
- Implement wave-based scheduling with parallel/serial rules
- Prevent same-file conflicts across tasks (serialize when needed)
- Planner follow-up loop: generate next tasks from results until done
- Add ResultAggregator validation and merge strategy

## 3) Settings UI + persistence
- Build settings panel in renderer (agent/model selection, API keys)
- Save/load settings to `.context/settings.json`
- Wire settings into Orchestrator run (active agent, model, permissions)
- Add basic form validation + secure handling of secrets
- Add IPC endpoints for get/set settings
