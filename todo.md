# LeetCode Tracker — TODO

> Mirrors `docs/superpowers/plans/2026-05-10-m1-foundation.md`. Each task = RED → GREEN → COMMIT.

## M1 — Foundation (37 tasks)

### Section A — Preparation
- [x] Task 1: Install M1 dependencies
- [x] Task 2: Wire client/server test infrastructure
- [x] Task 3: Create shared problem types & enums

### Section B — Database
- [x] Task 4: Define `problems` and `problemSolutions` tables
- [x] Task 5: Define `companyTags`, `problemLists`, `problemListItems`
- [x] Task 6: Define `aiSolutions`, `aiGenerationLocks`, `userProgress`, `attempts`, `syncLogs`
- [x] Task 7: Push schema to MySQL
- [x] Task 8: Set up in-memory SQLite test DB helper
- [x] Task 9: DB query helpers — listProblems
- [x] Task 10: DB helpers — getProblemBySlug, upsertProblem, recordSyncLog
- [x] Task 11: Confirm root todo.md checklist

### Section C — Sync Pipeline
- [x] Task 12: Constants & company roster
- [x] Task 13: LeetCode GraphQL client — fetchListProblems
- [x] Task 14: LeetCode detail fetch (en/zh) + officialSolutionZh
- [x] Task 15: Translation fallback (LLM-based EN→ZH HTML)
- [x] Task 16: liquidslr CSV fetcher with zod validation
- [x] Task 17: Sync orchestrator (concurrency guard + log writer)
- [x] Task 18: probe-leetcode-cn task + register all M1 sync tasks

### Section D — tRPC Routers & Scheduled
- [x] Task 19: `problems` router
- [x] Task 20: `lists` and `companies` routers
- [x] Task 21: `sync` router with owner-only `triggerManual`
- [x] Task 22: Heartbeat auth middleware + scheduled router skeleton
- [x] Task 23: Assemble feature routers in `server/routers.ts`
- [x] Task 24: Request HEARTBEAT_SECRET env

### Section E — Frontend Foundations
- [x] Task 25: Blueprint theme tokens + fonts in index.css
- [x] Task 26: i18n LangProvider + dictionaries
- [x] Task 27: BlueprintBackground + DifficultyBadge + StatusBadge
- [x] Task 28: useDebounce + useFilters hooks
- [x] Task 29: ProblemContent + CodeBlock + SolutionTabs

### Section F — Frontend Pages
- [x] Task 30: AppShell layout
- [x] Task 31: ProblemList page
- [x] Task 32: ProblemDetail page
- [x] Task 33: Lists page + ListDetail page
- [x] Task 34: Companies page + CompanyDetail page
- [x] Task 35: SyncStatus + Settings pages, wire all routes in App.tsx

### Section G — Bootstrap & Verification
- [x] Task 36: Run initial-bootstrap sync against real LeetCode + liquidslr (184 problems / 250 list-items / 862 company tags / 20 companies)
- [x] Task 37: M1 milestone verification + checkpoint + delivery

## QA Pass — 2026-05-11

### Phase 1: 走查
- [x] QA-1: 真实浏览器走查 ProblemList — 发现 BUG-1/2/3/4/5/26
- [x] QA-2: 走查 ProblemDetail — 发现 BUG-6/7/9/10/11
- [x] QA-3: 走查 Lists / ListDetail — 发现 BUG-12/13/14
- [x] QA-4: 走查 Companies / CompanyDetail — 发现 BUG-15/16/17
- [x] QA-5: 走查 Sync 页 — 发现 BUG-18/19/20
- [x] QA-6: 走查 Settings + 全局语言切换 + 404 — 发现 BUG-21/22/23/24/25
- [x] QA-7: 汇总 bug 清单到本节 — 25 个 bug

### Phase 2: bug 修复

**P0 - 造成页面不可用**
- [x] BUG-14/16: ListDetail / CompanyDetail 空数据 — drizzle `db.execute(sql, params)` 不支持位置参数，改 sql tagged template
- [x] BUG-1/8: 主内容区留白 — ProblemList grid 14rem 改回 + 删除多余 padding
- [x] BUG-6/17: Back 按钮重叠 — 改成单独一行 `← Back to ...`
- [x] BUG-10: SolutionTabs 全展开 — 改成 per-language Tab + 默认 Python
- [x] BUG-21: i18n 失效 — 各 page 接到 `t()`，扩字典覆盖所有 UI 文本

**P1 - 严重体验**
- [x] BUG-12/13: Lists slug 当标题 — 一次性 SQL 修正 + lists router 加 problemCount join
- [x] BUG-15: Companies 无题数 — companies router 加 countCompanyTags join
- [x] BUG-3: ProblemList AC% 全 0 — 直接隐藏列（M2 detail-fetch 任务再补）
- [x] BUG-4: 默认顺序 — listProblemsQuery 默认按 frontendId 升序
- [x] BUG-5: 没有总数/分页 — listProblemsQuery 加 total + 前端 LoadMore + "Showing N of M"
- [x] BUG-9: ProblemDetail EN/ZH 切换 + ZH fallback 提示
- [x] BUG-19/20: Manual sync 反馈 — 按钮 disabled + sonner toast
- [x] BUG-23/24: Settings 简化 — 移除重复 sidebar 选项

**P2 - 轻微**
- [x] BUG-22: sidebar EN/中 active — variant 切换
- [x] BUG-25: 404 — App.tsx 已有 NotFound 兜底
- [x] BUG-18: daily-sync-meta 重复 — 平台 cron heartbeat 自动触发，非 bug
- [x] BUG-2/7: 空 href — wouter Link 渲染行为，markdown 提取假象，非 bug
- [x] BUG-26（新）: paidOnly=0 (MySQL tinyint) 渲染成字面 0 — Boolean() 强转
- [x] NEW-1: sidebar "LeetCode Tracker" 标题被截 — 加宽 w-64 + 缩字号

### Phase 3: 回归 + 交付
- [x] 全部 vitest + tsc 通过 — 85/85 ✅（+5 新回归测试）
- [x] 二次走查每个页面 — Problems/Lists/ListDetail/ProblemDetail/Companies/Sync/中文模式 全过
- [x] checkpoint 交付 — 163a512b


## M2 — Online Judge (sandbox reset 后重建)

### Section A — 后端
- [x] OJ-1: schema 加 `submissions` + `problemTestcases` 两张表，drizzle push
- [x] OJ-2: `server/judge/sandboxRunner.ts` — Python/Java/C++ 子进程执行 + 5s wall clock + 1GB ulimit -v
- [x] OJ-3: `server/judge/harnessTemplates.ts` — Python harness 完整实现；Java/C++ 在 V1 报 "not yet supported"
- [x] OJ-4: `server/judge/testcaseGenerator.ts` — LLM 按题面生成 N 个 testcase suite (JSON)，缓存
- [x] OJ-5: `server/routers/judge.ts` — `run` mutation + `listSubmissions` query + 注册到 root router
- [x] OJ-6: `server/judge/judge.test.ts` — vitest 端到端：正确解 / wrong / syntax / 超时 4 类
- [x] OJ-7: tsc + vitest 全绿（89/89）

### Section B — 前端
- [x] OJ-8: 安装 `@monaco-editor/react`
- [x] OJ-9: i18n EN/ZH 加 judge 文案
- [x] OJ-10: `client/src/components/SolvePanel.tsx` — Monaco editor + 语言选择 + 提交按钮 + verdict 卡片 + 提交记录
- [x] OJ-11: `ProblemDetail.tsx` 加 "Solve / 写代码" tab，加载 codeSnippetsJson 模板

### Section C — 验证 & 交付
- [x] OJ-12: 立即 checkpoint（防止再次丢失）— e680636c
- [x] OJ-13: 浏览器端到端 — Two Sum 正确解 **Accepted 12/12 / 36ms** ✅
- [x] OJ-15: 修复 sandbox 环境 PYTHONHOME 污染导致的 SRE module mismatch
- [x] OJ-16: harness/generator 都兼容 LLM 输出 `args` 、`arguments`、`params` 名字
- [x] OJ-17: LLM 同时生成 `referenceSolution`，后端跑一次参考解 → expected 以参考解为准（避免 LLM 算错）
- [x] OJ-14: 终交付 + 状态报告 — b02d118d

## M2.1 — UI Cleanup
- [x] UI-1: 删除 ProblemDetail Description tab 底部的 SolutionTabs（代码模板预览），用户写代码统一走 SOLVE tab
- [x] UI-2: SOLVE tab 改成 side-by-side：左 5列题面（sticky） + 右 7列 SolvePanel；根容器 max-w-[1600px]；lg 以下纵向堆叠
- [x] UI-3: judge router 加 `getSubmission(id)`；listSubmissions 列表行可点击弹 Dialog 显示完整代码 + verdict + first failing case 详情
- [x] OJ-18: Python harness 注入 LeetCode 标准 imports（typing/collections/math/heapq/bisect/itertools/functools），修复 `name 'List' is not defined` 阻塞 bug；加 vitest 防回归 · 91/91
- [x] UI-4: SubmissionDetailDialog 改成可拖动悬浮窗（拖标题栏移动、无 backdrop）+ 宽高自适应；createPortal + Pointer Events + Esc 关闭
