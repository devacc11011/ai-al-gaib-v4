# ai-al-gaib-v4

An Electron application with React and TypeScript

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

## Agent Adapter Smoke Test

1. Set the API key for the agent you want to test:
   - Claude: `ANTHROPIC_API_KEY`
   - Codex: `OPENAI_API_KEY`
   - Gemini CLI: ensure `gemini` is on PATH (and authenticated).
2. Update `.context/settings.json` with `activeAgent` (`claude-code`, `codex`, `gemini-cli`).
3. Run the app and click **Run Core Pipeline**.
4. Confirm `.context/tasks/task-001-result.md` contains the agent summary and the UI shows events.

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```
