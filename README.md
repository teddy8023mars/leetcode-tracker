# LeetCode Tracker

A personal LeetCode practice app with bilingual problem content, curated study lists,
company tags, progress tracking, AI-generated explanations, and a local online judge.

The project is a TypeScript monorepo:

- `client/` - React 19 SPA, Vite, Tailwind CSS v4, shadcn/ui-style components, wouter routing.
- `server/` - Express, tRPC, scheduled sync endpoints, OAuth/session plumbing, judge runtime.
- `shared/` - Zod schemas and shared types used by both client and server.
- `drizzle/` - MySQL schema and migrations.

## Current Status

- GitHub repo: `teddy8023mars/leetcode-tracker`
- Default branch: `master`
- CI: GitHub Actions runs `pnpm check` and `pnpm test`
- Test baseline: `42` test files / `130` tests passing
- Main local workflow: use git worktrees for new feature work

## Features

- Problem list with search, difficulty/status/company/topic filtering, and pagination.
- Problem detail page with bilingual content fallback, related problems, tags, company labels, official/AI solutions, and a side-by-side solve panel.
- Local code editor powered by Monaco with Python/Java/C++ templates.
- Online judge pipeline with generated test suites, cached submissions, verdicts, and first-failing-case details.
- User progress tracking with todo/reviewing/done states and SM-2 spaced repetition fields.
- Sync pipeline for LeetCode study plans, LeetCode detail data, Chinese content fallback, and company tags.
- Owner-only manual sync controls and heartbeat-protected scheduled endpoints.

## Quick Start

Requirements:

- Node.js 24
- pnpm 10.4.1
- MySQL if you want real persisted data

```bash
pnpm install
cp .env.example .env
pnpm dev
```

The dev server starts Express and Vite together. By default it tries port `3000`
and will use the next available port if needed.

Without `DATABASE_URL`, the server still boots, but most data-backed screens return
empty data. That is useful for frontend-only work, but real sync/progress/judge
history requires a database.

## Environment

Do not commit `.env`. Start from [.env.example](.env.example).

Important variables:

- `DATABASE_URL` - MySQL connection string used by Drizzle.
- `JWT_SECRET` - session cookie signing secret.
- `OWNER_OPEN_ID` - enables owner-only sync actions for that OAuth user.
- `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL`, `VITE_APP_ID` - Manus OAuth/app wiring.
- `HEARTBEAT_SECRET` - protects `/api/scheduled/*` endpoints.
- `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY` - OpenAI-compatible Forge endpoint used for translation and test generation.
- `BOOTSTRAP_SKIP_CN`, `BOOTSTRAP_SKIP_LLM` - optional bootstrap switches for long-running sync jobs.

## Common Commands

```bash
pnpm dev       # Run Express + Vite dev server
pnpm build     # Build client and bundle server into dist/
pnpm start     # Run production build
pnpm check     # TypeScript type check
pnpm test      # Vitest test suite
pnpm format    # Prettier write
pnpm db:push   # Generate and run Drizzle migrations
```

Single test example:

```bash
pnpm vitest run server/__tests__/sync.leetcode.detail.test.ts
```

## Development Workflow

Use a new worktree for every feature or cleanup:

```bash
git fetch origin
git worktree add /private/tmp/leetcode-tracker-my-feature -b codex/my-feature origin/master
cd /private/tmp/leetcode-tracker-my-feature
pnpm install --frozen-lockfile
```

Before pushing:

```bash
pnpm check
pnpm test
git diff
```

Keep commits small and behavior-focused. Good commit examples:

- `fix: stabilize scheduled sync tests`
- `feat: add review dashboard`
- `docs: add project setup guide`

## Architecture Notes

### API

The app exposes a typed tRPC API at `/api/trpc`. The root router is assembled in
`server/routers.ts` and currently includes:

- `problems` - list/detail/solutions/company tags
- `lists` and `companies` - metadata for curated lists and company tags
- `progress` - local progress and spaced repetition
- `judge` - authenticated code submission and submission history
- `aiSolutions` - cached AI explanations and admin generation
- `sync` - sync status and owner-only manual triggers
- `auth` and `system` - session and system plumbing

### Data

The primary schema lives in `drizzle/schema.ts`. Tests use an in-memory SQLite
helper in `server/testHelpers/inMemoryDb.ts`, so schema changes usually need a
matching test DDL update.

### Sync

Sync jobs are registered in `server/sync/index.ts` and executed through the
orchestrator in `server/sync/orchestrator.ts`. Scheduled HTTP endpoints live in
`server/scheduled.ts` and are protected by `HEARTBEAT_SECRET`.

### Judge

The judge writes temporary files, runs user code in subprocesses with time and
memory limits, and stores submissions. It is suitable for local/dev use; a real
production deployment should replace it with a stronger sandbox.

## Documentation

- [Developer log](docs/dev-log.md)
- [M1 verification report](docs/M1-VERIFICATION.md)
- Planning/spec history under `docs/superpowers/`

## Notes for Future Work

- Prefer GitHub issues for new features before implementation.
- Keep `.env.example` updated when adding environment variables.
- Run `pnpm check` and `pnpm test` before every push.
- For database schema changes, update Drizzle schema, migrations, and in-memory test DDL together.
