# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ClawDesk is an Electron desktop application that provides a graphical interface for OpenClaw AI agents. It connects to an OpenClaw Gateway process (managed as a child process) over WebSocket using JSON-RPC.

## Commands

```bash
pnpm init              # Install deps + download UV binaries (first-time setup)
pnpm dev               # Start dev mode with hot reload (Vite + Electron)
pnpm build             # Full production build (Vite → bundle OpenClaw → electron-builder)
pnpm build:vite        # Vite build only (no packaging)
pnpm lint              # ESLint with auto-fix
pnpm typecheck         # TypeScript type checking (tsc --noEmit)
pnpm test              # Run unit tests (Vitest)
pnpm test:e2e          # Run E2E tests (Playwright)
```

Run a single test file: `pnpm vitest run tests/unit/stores.test.ts`

## Architecture

**Dual-process Electron app:**

```
Electron Main Process ──IPC (preload bridge)──▶ React Renderer Process
       │                                              │
       │ (manages lifecycle)                          │ WebSocket (JSON-RPC)
       ▼                                              ▼
  OpenClaw Gateway ◀──────────────────────────────────┘
```

- **Main process** (`electron/`): Window management, system tray, IPC handlers, Gateway process supervision, auto-updates, secure storage (system keychain for API keys)
- **Renderer process** (`src/`): React 19 UI with React Router, Zustand stores, Tailwind CSS, shadcn/ui components
- **Preload bridge** (`electron/preload/index.ts`): Context-isolated IPC with ~80+ whitelisted channels

### Key directories

- `electron/main/` — App init, window, menu, tray, IPC handlers, updater
- `electron/gateway/` — Gateway lifecycle manager, WebSocket JSON-RPC client, protocol types
- `electron/utils/` — Config, paths, storage, provider registry, UV/Python setup, logging
- `src/pages/` — Route pages: Setup, Dashboard, Chat, Channels, Skills, Cron, Settings
- `src/stores/` — Zustand stores (chat, gateway, settings, channels, cron, providers, skills, update)
- `src/components/ui/` — shadcn/ui base components
- `src/i18n/locales/` — Translations: `en/`, `zh/`, `ja/`, `vi/`
- `tests/unit/` — Vitest unit tests

### Path aliases

- `@/*` → `src/*`
- `@electron/*` → `electron/*`

### Ports

- Dev server: `5173`
- OpenClaw Gateway: `18789`
- GUI production: `23333`

## Code Style

- **Prettier**: single quotes, semicolons, 2-space indent, 100 char width, ES5 trailing commas
- **ESLint**: TypeScript strict, React hooks rules. Unused vars allowed with `_` prefix
- **TypeScript**: strict mode enabled, `noUnusedLocals`, `noUnusedParameters`

## Key Patterns

- **State management**: Zustand stores in `src/stores/`. The chat store (`chat.ts`) is the largest and handles message streaming, sessions, and Gateway RPC calls
- **IPC communication**: All renderer↔main communication goes through the preload bridge. Add new channels in `electron/preload/index.ts` and handlers in `electron/main/ipc-handlers.ts`
- **Gateway communication**: JSON-RPC over WebSocket with exponential backoff reconnection. Protocol types in `electron/gateway/protocol.ts`
- **i18n**: All user-facing strings go through i18next. Three locale directories under `src/i18n/locales/`
- **UI components**: Built on shadcn/ui (Radix primitives + CVA + tailwind-merge). Dark mode via Tailwind class strategy
