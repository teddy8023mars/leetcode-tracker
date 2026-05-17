# Developer Log

This log records high-signal project decisions, completed work, verification
results, and follow-ups. Keep entries short enough to scan.

## 2026-05-18

### Repository and CI baseline

- Created the private GitHub repository `teddy8023mars/leetcode-tracker`.
- Added GitHub Actions CI for `pnpm install --frozen-lockfile`, `pnpm check`, and `pnpm test`.
- Stabilized the local test baseline so CI can run without sandbox-specific socket failures.
- Verified the latest GitHub Actions run passes.

### Development workflow decision

- New feature work should use git worktrees.
- Default branch naming should use `codex/<feature-name>` when possible.
- Work should start from `origin/master`, not from a dirty local working tree.

Example:

```bash
git fetch origin
git worktree add /private/tmp/leetcode-tracker-feature -b codex/feature origin/master
```

### Known local state

- The original local workspace at `/Users/teddy/Desktop/leetcode-tracker` had uncommitted edits when the GitHub baseline was created.
- The pushed GitHub baseline came from a clean worktree, not from the dirty original workspace.
- Before using the original workspace again, inspect `git status` and decide whether to keep, commit, or discard those local edits.

## Entry Template

```md
## YYYY-MM-DD

### Short title

- What changed:
- Why it changed:
- Verification:
- Follow-ups:
```
