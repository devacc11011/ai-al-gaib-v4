# Ai AL GAIB

Planner-Executor 구조로 복잡한 작업은 Planner가 설계하고, 실제 구현은 Executor에 맡겨 **비용 효율적**으로 실행하는 데 초점을 둔 데스크톱 앱.
또한 대규모 작업을 각 작업으로 분해해 성공적으로 목표를 달성하는 것에 중점을 둡니다.

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
