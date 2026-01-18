# AI Agent Orchestrator Architecture

## Overview

다중 AI 에이전트(Claude Code, Codex, Gemini-CLI)를 Planner-Executor 패턴으로 오케스트레이션하는 시스템.
Electron + electron-vite 기반 데스크톱 앱에서 설정/실행/이벤트 스트리밍을 제공한다.

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Interface                           │
│                      (CLI / API Server)                         │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Orchestrator                            │
│  ┌───────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │    Planner    │──│   Executor   │──│   Result Aggregator  │  │
│  │  (Task Graph) │  │  (Scheduler) │  │     (Merge/Verify)   │  │
│  └───────────────┘  └──────────────┘  └──────────────────────┘  │
│                 ▲              │               │               │
│                 │              ▼               ▼               │
│             Event Bus ──── task:started/task:completed ──────── │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Context Manager                            │
│           (MD 기반 상태 관리 / 에이전트 간 통신)                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ TaskContext │  │ FileContext │  │ ConversationContext     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────┬───────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│  AgentAdapter │     │  AgentAdapter │     │  AgentAdapter │
│  (Claude Code)│     │    (Codex)    │     │  (Gemini-CLI) │
└───────────────┘     └───────────────┘     └───────────────┘
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│  Claude Code  │     │  OpenAI API   │     │  Gemini API   │
│   CLI/SDK     │     │   (Codex)     │     │   (CLI)       │
└───────────────┘     └───────────────┘     └───────────────┘
```

---

## Core Components

### 1. Orchestrator

| 서브 컴포넌트 | 역할 |
|-------------|------|
| **Planner** | 사용자 요청을 Task Graph(DAG)로 분해, 사용자 지정 에이전트 매핑 |
| **Executor** | Task 의존성 분석, Wave 단위 병렬/순차 스케줄링 |
| **Result Aggregator** | 에이전트 결과 병합, 충돌 해결, 최종 검증 |
| **Event Bus** | plan/task/run 이벤트 스트리밍 (UI/IPC 연결) |

### 2. Context Manager

MD 파일 기반 에이전트 간 상태 공유 및 통신.

```
.context/
├── tasks/           # 태스크별 컨텍스트
├── sessions/        # 세션 히스토리
├── agents/          # 에이전트별 상태
└── shared/          # 코드베이스 요약, 컨벤션
```

### 3. Agent Adapter

공통 인터페이스로 추상화, 각 에이전트별 구현체 상속.

| 에이전트 | 연동 방식 | 주요 Capability |
|---------|----------|-----------------|
| Claude Code | SDK/CLI | file-edit, terminal-access, multi-file-edit |
| Codex | OpenAI API | code-generation, terminal-access |
| Gemini-CLI | CLI Process | code-generation, web-search |

---

## Task Execution Model

**Wave 기반 하이브리드 실행:**

```
Wave 1: [Task A, Task B, Task C]  ← 병렬 (의존성 없음)
          ↓
Wave 2: [Task D, Task E]          ← 병렬 (Wave 1 완료 후)
          ↓
Wave 3: [Task F]                  ← 순차 (Wave 2 완료 후)
```

**독립 작업 판별:**
- Task에 `dependencies` 필드로 의존 관계 명시
- 같은 파일 수정하는 태스크는 자동 직렬화
- 의존성 모두 완료된 태스크만 실행 대기열에 추가

---

## Event-Driven Planner Loop (MVP)

Executor가 `task:completed` 이벤트를 발행하면 Orchestrator가 Planner에 전달하여
후속 Task를 생성하고 실행 큐에 추가한다. 기본 MVP는 `task-001` 완료 시
요약/후속 작업용 `task-002`를 생성한다.

---

## Data Flow

```
User Request
    ↓
Planner → TaskGraph (DAG) 생성
    ↓
Executor → Wave 단위 스케줄링
    ↓
각 Wave 병렬 실행:
  Context 준비 → AgentAdapter.execute() → Context 업데이트
    ↓
Event Bus → UI/IPC로 실시간 이벤트 스트리밍
    ↓
ResultAggregator → 결과 병합 & 검증
    ↓
Final Output
```
