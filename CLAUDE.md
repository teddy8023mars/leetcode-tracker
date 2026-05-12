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

- **`client/`** — React 19 SPA. Vite-bundled, Tailwind CSS v4, shadcn/ui (new-york style). Uses wouter for routing (patched), TanStack Query via tRPC React bindings.
- **`server/`** — Express server serving both the tRPC API (`/api/trpc`) and the Vite dev middleware (or static files in prod). Entry point: `server/_core/index.ts`.
- **`shared/`** — Zod schemas and type re-exports consumed by both sides. `shared/types.ts` re-exports all Drizzle inferred types.

### Server structure

- `server/_core/` — Framework plumbing: Express setup, tRPC init, auth/context, OAuth, LLM client, env config. The tRPC instance (`trpc.ts`) exports `publicProcedure`, `protectedProcedure`, and `adminProcedure`.
- `server/routers.ts` — Root tRPC router assembling sub-routers: `problems`, `lists`, `companies`, `sync`, `judge`, `auth`, `system`.
- `server/routers/` — Individual tRPC routers per domain.
- `server/sync/` — LeetCode data sync pipeline: orchestrator, LeetCode GraphQL fetchers, liquidslr CSV importer, LLM translation. Runs via scheduled endpoints (`/api/scheduled/*`) or manual tRPC triggers.
- `server/judge/` — Online judge: sandbox code runner, harness templates, LLM-generated test case suites.
- `server/db.ts` — Drizzle query helpers with lazy MySQL connection via `getDb()`. Production uses MySQL (mysql2); tests use better-sqlite3 in-memory.

### Database

Drizzle ORM with MySQL dialect. Schema in `drizzle/schema.ts`, migrations in `drizzle/`. Key tables: `problems`, `problemSolutions`, `companyTags`, `problemLists`, `problemListItems`, `aiSolutions`, `userProgress`, `attempts`, `submissions`, `syncLogs`.

### Client structure

- `client/src/lib/trpc.ts` — tRPC client instance typed against `AppRouter`.
- `client/src/pages/` — Route-level components (ProblemList, ProblemDetail, Companies, Lists, SyncStatus, Settings).
- `client/src/components/` — Shared components. `ui/` subdirectory is shadcn/ui primitives.
- `client/src/i18n/` — Bilingual support (en/zh) via context provider (`LangContext`).
- `client/src/contexts/` — ThemeProvider (light/dark) and LangProvider.

### Auth model

Three tRPC procedure levels: `publicProcedure` (no auth), `protectedProcedure` (logged-in user), `ownerOnlyProcedure` (matches `OWNER_OPEN_ID` env var). Auth via Manus OAuth → JWT session cookie.

### Testing

Vitest with environment auto-switching: `client/src/**` runs in jsdom, `server/**` runs in Node. Client tests use `@testing-library/react`. Server tests use an in-memory SQLite database (`server/testHelpers/inMemoryDb.ts`) mirroring the MySQL schema.

### Path aliases

`@/` → `client/src/`, `@shared/` → `shared/`. Configured in both `tsconfig.json` and `vite.config.ts`.
