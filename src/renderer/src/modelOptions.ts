export interface ModelOption {
  value: string
  label: string
}

export const claudeModels: ModelOption[] = [
  { value: 'claude-opus-4-1-20250805', label: 'Claude Opus 4.1 (20250805)' },
  { value: 'claude-opus-4-1', label: 'Claude Opus 4.1 (alias)' },
  { value: 'claude-opus-4-20250514', label: 'Claude Opus 4 (20250514)' },
  { value: 'claude-opus-4-0', label: 'Claude Opus 4 (alias)' },
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (20250514)' },
  { value: 'claude-sonnet-4-0', label: 'Claude Sonnet 4 (alias)' },
  { value: 'claude-3-7-sonnet-20250219', label: 'Claude Sonnet 3.7 (20250219)' },
  { value: 'claude-3-7-sonnet-latest', label: 'Claude Sonnet 3.7 (alias)' },
  { value: 'claude-3-5-sonnet-20241022', label: 'Claude Sonnet 3.5 (20241022)' },
  { value: 'claude-3-5-sonnet-20240620', label: 'Claude Sonnet 3.5 (20240620)' },
  { value: 'claude-3-5-haiku-20241022', label: 'Claude Haiku 3.5 (20241022)' },
  { value: 'claude-3-5-haiku-latest', label: 'Claude Haiku 3.5 (alias)' },
  { value: 'claude-3-haiku-20240307', label: 'Claude Haiku 3 (20240307)' }
]

export const codexModels: ModelOption[] = [
  { value: 'gpt-5.2-codex', label: 'GPT-5.2 Codex' },
  { value: 'gpt-5.1-codex-mini', label: 'GPT-5.1 Codex Mini' },
  { value: 'gpt-5.1-codex-max', label: 'GPT-5.1 Codex Max' },
  { value: 'gpt-5.2', label: 'GPT-5.2 (alternative)' },
  { value: 'gpt-5.1', label: 'GPT-5.1 (alternative)' },
  { value: 'gpt-5.1-codex', label: 'GPT-5.1 Codex (alternative)' },
  { value: 'gpt-5-codex', label: 'GPT-5 Codex (alternative)' },
  { value: 'gpt-5-codex-mini', label: 'GPT-5 Codex Mini (alternative)' },
  { value: 'gpt-5', label: 'GPT-5 (alternative)' }
]

export const geminiModels: ModelOption[] = [
  { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro (preview)' },
  { value: 'gemini-3-pro-image-preview', label: 'Gemini 3 Pro Image (preview)' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { value: 'gemini-2.5-pro-preview-tts', label: 'Gemini 2.5 Pro TTS (preview)' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'gemini-2.5-flash-preview-09-2025', label: 'Gemini 2.5 Flash (preview 09-2025)' },
  { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite' },
  { value: 'gemini-2.5-flash-lite-preview-09-2025', label: 'Gemini 2.5 Flash-Lite (preview 09-2025)' },
  { value: 'gemini-2.5-flash-image', label: 'Gemini 2.5 Flash Image' },
  { value: 'gemini-2.5-flash-image-preview', label: 'Gemini 2.5 Flash Image (deprecated preview)' },
  { value: 'gemini-flash-latest', label: 'Gemini Flash (latest alias)' }
]
