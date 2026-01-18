# Implementation Guide

## Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop App | Electron + electron-vite |
| Frontend | React + shadcn/ui |
| Language | TypeScript |
| AI Agents | Claude Agent SDK, Codex SDK, Gemini CLI |

---

## Agent SDK Integration

### 1. Claude Code Agent

**SDK**: `@anthropic-ai/claude-agent-sdk`

```bash
npm install @anthropic-ai/claude-agent-sdk
```

**핵심 기능:**
- `query()`: 메인 실행 함수 (AsyncGenerator 반환)
- Streaming Input Mode 권장 (이미지 첨부, 다중 턴, 훅 지원)
- `permissionMode`: `'default'` | `'acceptEdits'` | `'bypassPermissions'`
- `hooks`: PreToolUse, PostToolUse 등 실행 흐름 제어

**Workspace Sandbox 설정:**
```typescript
query({
  prompt: taskPrompt,
  options: {
    cwd: workspacePath,                    // 작업 디렉토리 지정
    additionalDirectories: [workspacePath], // 접근 가능 디렉토리
    permissionMode: 'acceptEdits',          // 파일 편집 자동 승인
    maxTurns: 10,
    allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep']
  }
})
```

**Hooks 활용:**
```typescript
hooks: {
  PreToolUse: [{
    matcher: 'Write|Edit',
    hooks: [validateFilePathHook]  // 파일 경로 검증
  }],
  PostToolUse: [{
    hooks: [logToolResultHook]     // 결과 로깅
  }]
}
```

---

### 2. Codex Agent

**SDK**: `@openai/codex-sdk`

```bash
npm install @openai/codex-sdk
```

**핵심 기능:**
- Thread 기반 대화 (threadId로 이전 세션 재개 가능)
- Server-side 전용 (Node.js 18+)

**기본 사용:**
```typescript
import { Codex } from "@openai/codex-sdk";

const codex = new Codex();
const thread = codex.startThread();
const result = await thread.run(taskPrompt);

// 세션 재개
const resumedThread = codex.resumeThread(previousThreadId);
```

---

### 3. Gemini CLI Agent

**CLI**: `gemini` (headless mode)

**핵심 기능:**
- `--prompt` / `-p`: headless 모드 활성화
- `--output-format json`: 구조화된 출력
- `--output-format jsonl`: 실시간 스트리밍 이벤트
- `--yolo` / `-y`: 액션 자동 승인

**Headless 실행:**
```bash
gemini --prompt "task description" --output-format json
```

**JSONL 스트리밍 이벤트 타입:**
- `init`: 세션 시작
- `message`: 사용자/어시스턴트 메시지
- `tool_use`: 도구 호출
- `tool_result`: 실행 결과
- `result`: 최종 결과

**Node.js 프로세스 스폰:**
```typescript
import { spawn } from 'child_process';

const gemini = spawn('gemini', [
  '--prompt', taskPrompt,
  '--output-format', 'jsonl',
  '--yolo'
]);

gemini.stdout.on('data', (data) => {
  const events = data.toString().split('\n').filter(Boolean);
  events.forEach(event => {
    const parsed = JSON.parse(event);
    // 이벤트 타입별 처리
  });
});
```

---

## Workflow: Planner-Executor Loop

```
┌─────────────────────────────────────────────────────────────┐
│                         Planner                             │
│  1. 사용자 요청 분석                                          │
│  2. TaskGraph 생성 (의존성 DAG)                              │
│  3. 각 Task를 MD 파일로 생성                                  │
│     → .context/tasks/task-{id}.md                          │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Context Manager                         │
│  - Task MD 파일 저장/로드                                     │
│  - 에이전트에게 전달할 컨텍스트 요약 생성                         │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        Executor                             │
│  1. Task MD 파일 읽기                                        │
│  2. 지정된 Agent Adapter 실행                                │
│  3. 결과 요약 MD 생성                                         │
│     → .context/tasks/task-{id}-result.md                   │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Planner (반복)                            │
│  1. 결과 MD 읽기                                             │
│  2. TaskGraph 상태 업데이트                                   │
│  3. 다음 실행 가능 Task 추출                                   │
│  4. 모든 Task 완료 시 종료                                     │
└─────────────────────────────────────────────────────────────┘
```

---

## Task MD Format

### Input Task (Planner → Executor)

```markdown
<!-- .context/tasks/task-001.md -->
# Task: {task_title}

## Metadata
- ID: task-001
- Agent: claude-code | codex | gemini-cli
- Status: pending
- Dependencies: [task-000]
- Workspace: /path/to/workspace

## Description
{상세 작업 설명}

## Input Context
- 관련 파일: src/auth/*
- 이전 Task 결과: [task-000-result.md](./task-000-result.md)

## Expected Output
- 생성/수정할 파일 목록
- 성공 기준
```

### Result Summary (Executor → Planner)

```markdown
<!-- .context/tasks/task-001-result.md -->
# Result: {task_title}

## Metadata
- ID: task-001
- Status: completed | failed
- Duration: 45s
- Agent: claude-code

## Files Modified
- src/auth/jwt.ts (created)
- src/middleware/auth.ts (modified)

## Summary
{작업 결과 요약 - 2-3문장}

## Handoff Notes
{다음 Task를 위한 참고 사항}
- JWT_SECRET 환경변수 설정 필요
- 테스트 코드 작성 필요

## Errors (if any)
{발생한 에러 및 해결 시도}
```

---

## Workspace Sandbox

사용자가 지정한 폴더를 sandbox로 사용:

```typescript
interface WorkspaceConfig {
  path: string;           // 작업 디렉토리 절대 경로
  allowedPaths: string[]; // 추가 접근 허용 경로
  readOnly: boolean;      // 읽기 전용 모드
}
```

**Agent별 Sandbox 적용:**

| Agent | Sandbox 설정 방법 |
|-------|------------------|
| Claude Code | `cwd`, `additionalDirectories` 옵션 |
| Codex | 작업 디렉토리에서 thread 시작 |
| Gemini CLI | 해당 디렉토리에서 프로세스 실행 |

---

## Directory Structure

```
ai-al-gaib-v3/
├── src/
│   ├── main/                    # Electron main process
│   │   ├── index.ts
│   │   ├── ipc/                 # IPC handlers
│   │   ├── orchestrator/
│   │   │   ├── Orchestrator.ts
│   │   │   ├── Planner.ts
│   │   │   ├── Executor.ts
│   │   │   ├── ResultAggregator.ts
│   │   │   └── EventBus.ts
│   │   ├── context/
│   │   │   ├── ContextManager.ts
│   │   │   ├── MarkdownParser.ts
│   │   │   └── Summarizer.ts
│   │   ├── agents/
│   │   │   ├── base/
│   │   │   │   └── AgentAdapter.ts
│   │   │   ├── claude/
│   │   │   │   └── ClaudeCodeAdapter.ts
│   │   │   ├── codex/
│   │   │   │   └── CodexAdapter.ts
│   │   │   └── gemini/
│   │   │       └── GeminiAdapter.ts
│   │   ├── settings/
│   │   │   ├── Settings.ts
│   │   │   └── SettingsStore.ts
│   │   └── graph/
│   │       ├── TaskGraph.ts
│   │       └── DependencyResolver.ts
│   │
│   ├── preload/
│   │   ├── index.ts
│   │   └── ...
│   │
│   └── renderer/                # React frontend
│       ├── index.html
│       └── src/
│           ├── App.tsx
│           ├── components/      # shadcn/ui components
│           └── pages/
│
├── .context/                    # Runtime context (gitignored)
├── electron.vite.config.ts
├── package.json
└── tsconfig.json
```

---

## Key Implementation Notes

### 1. Agent Adapter 공통 인터페이스

```typescript
abstract class AgentAdapter {
  abstract name: AgentType;
  abstract execute(task: Task, context: Context): Promise<TaskResult>;
  abstract isAvailable(): Promise<boolean>;

  // Optional
  stream?(task: Task, context: Context): AsyncGenerator<StreamChunk>;
  cancel?(taskId: string): Promise<void>;
}
```

### 2. Claude Code Streaming Mode 사용

- Single message보다 Streaming Input Mode 권장
- 이미지 첨부, hooks, 실시간 피드백 지원
- `includePartialMessages: true`로 스트리밍 출력

### 3. Gemini CLI JSONL 파싱

- 각 라인이 독립적인 JSON 이벤트
- `result` 이벤트에서 최종 결과 추출
- 에러 핸들링: `error` 이벤트 모니터링

### 4. Permission 처리

| Agent | Permission 전략 |
|-------|-----------------|
| Claude Code | `permissionMode: 'acceptEdits'` 또는 hooks로 자동 승인 |
| Codex | API 기반, 별도 권한 불필요 |
| Gemini CLI | `--yolo` 플래그로 자동 승인 |

### 5. Context 요약 전략

- Task 결과는 2000자 이내로 요약
- 다음 Task에 필요한 핵심 정보만 포함
- 파일 변경 목록은 항상 포함

---

## Settings + Agent Selection (MVP)

- Settings는 `.context/settings.json`에 저장
- UI에서 에이전트/모델 선택 및 API 키 입력 가능
- Orchestrator는 실행 시 active agent를 읽어서 실행

## Event-Driven Execution (MVP)

- Planner가 플랜 생성 시 `plan:created` 이벤트 발행
- Executor가 `task:started`, `task:completed` 이벤트 발행
- Orchestrator가 `run:completed` 이벤트 발행
- Electron IPC로 renderer에 이벤트 스트리밍하여 UI에서 실행 상태 표시

## Follow-up Planning (MVP)

- `task-001` 완료 시 요약/다음 단계용 `task-002` 자동 생성
- 후속 Task는 `.context/tasks/task-002.md`로 기록
