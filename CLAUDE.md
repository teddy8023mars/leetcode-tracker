# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev              # Start dev server (Express + Vite HMR), port 3000
pnpm build            # Vite client build + esbuild server bundle → dist/
pnpm start            # Run production build
pnpm check            # TypeScript type-check (no emit)
pnpm test             # Run all tests (vitest)
npx vitest run server/__tests__/sync.leetcode.detail.test.ts   # Single test file
pnpm format           # Prettier format all files
pnpm db:push          # Generate + run Drizzle migrations (requires DATABASE_URL)
```

## Architecture

Monorepo with three top-level source directories sharing a single `package.json`:

- **`client/`** — React 19 SPA. Vite-bundled, Tailwind CSS v4, shadcn/ui (new-york style). Uses wouter for routing (patched via `patches/`), TanStack Query via tRPC React bindings.
- **`server/`** — Express server serving the tRPC API (`/api/trpc`), scheduled endpoints (`/api/scheduled/*`), and Vite dev middleware (or static files in prod). Entry point: `server/_core/index.ts`.
- **`shared/`** — Zod schemas (`shared/problemTypes.ts`) and type re-exports consumed by both sides. `shared/types.ts` re-exports all Drizzle inferred types.

### Server structure

- `server/_core/` — Framework plumbing: Express setup, tRPC init, auth/context, OAuth, LLM client, env config.
- `server/_core/trpc.ts` — Exports `publicProcedure`, `protectedProcedure`, `adminProcedure`.
- `server/_core/ownerOnly.ts` — Exports `ownerOnlyProcedure` (checks `ctx.user.openId === ENV.ownerOpenId`).
- `server/routers.ts` — Root tRPC router assembling sub-routers: `problems`, `lists`, `companies`, `sync`, `judge`, `auth`, `system`. Exports `AppRouter` type used by the client.
- `server/routers/` — Individual tRPC routers per domain.
- `server/sync/` — LeetCode data sync pipeline. The orchestrator (`orchestrator.ts`) uses dependency injection for testability (`__setSyncDepsForTest`, `registerSyncTasks`). Task handlers are registered in `sync/index.ts`. Data sources: LeetCode GraphQL API (en + cn), liquidslr CSV (company tags), LLM translation (via Forge API) for missing Chinese content.
- `server/judge/` — Online judge: sandbox code runner, harness templates, LLM-generated test case suites.
- `server/scheduled.ts` — Express router for cron-triggered sync endpoints, protected by `HEARTBEAT_SECRET` header auth.
- `server/db.ts` — Drizzle query helpers with lazy MySQL connection via `getDb()`. Contains both Drizzle-native queries and raw SQL via `sql` tagged templates for complex filtered/paginated queries.

### Database

Drizzle ORM with MySQL dialect. Schema in `drizzle/schema.ts`, migrations in `drizzle/`. Key tables: `problems`, `problemSolutions`, `companyTags`, `problemLists`, `problemListItems`, `aiSolutions`, `userProgress`, `attempts`, `syncLogs`.

### Client structure

- `client/src/lib/trpc.ts` — tRPC client instance typed against `AppRouter`.
- `client/src/pages/` — Route-level components (ProblemList, ProblemDetail, Companies, Lists, SyncStatus, Settings).
- `client/src/components/` — Shared components. `ui/` subdirectory is shadcn/ui primitives.
- `client/src/i18n/` — Bilingual support (en/zh) via context provider (`LangContext`).
- `client/src/contexts/` — ThemeProvider (light/dark) and LangProvider.

### Key patterns

- **tRPC + superjson**: Both client and server use `superjson` as the tRPC transformer, so Date objects, Maps, etc. serialize automatically. The client connects via `httpBatchLink` at `/api/trpc`.
- **Lazy DB**: `getDb()` returns `null` when `DATABASE_URL` is unset, so the server boots without a database for local frontend-only development.
- **Auth levels**: Four tRPC procedure levels — `publicProcedure` (no auth), `protectedProcedure` (logged-in user), `adminProcedure` (role === 'admin'), `ownerOnlyProcedure` (matches `OWNER_OPEN_ID` env var). Auth via Manus OAuth → JWT session cookie.
- **LLM client**: `server/_core/llm.ts` wraps a Forge-hosted OpenAI-compatible API. Used for Chinese content translation (`sync/translation.ts`) and test case generation (`judge/testcaseGenerator.ts`).

### Testing

Vitest with environment auto-switching: `client/src/**` runs in jsdom, `server/**` runs in Node. Client tests use `@testing-library/react`. Server tests use an in-memory SQLite database (`server/testHelpers/inMemoryDb.ts`) that mirrors the MySQL schema with a hand-maintained DDL.

### Path aliases

`@/` → `client/src/`, `@shared/` → `shared/`, `@assets/` → `attached_assets/`. Configured in `tsconfig.json`, `vite.config.ts`, and `vitest.config.ts`.
