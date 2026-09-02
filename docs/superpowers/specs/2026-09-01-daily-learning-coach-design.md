# Daily Learning Coach — Design Spec

Turn LeetCode Tracker into an adherence-first daily study coach for a long-term Google Singapore goal. Google SWE interview preparation is the primary track; Google Cloud Professional Data Engineer preparation is the secondary track.

The feature must make it easier to return after a missed day than to quit. It therefore measures completed learning days per week, not an unbroken streak, and it never creates overdue study debt.

## Product Principles

- Target five completed learning days per week.
- A standard session takes about 85–90 minutes; a minimum session takes 25 minutes.
- Every standard session has exactly one core new coding problem.
- Missing a day does not create a backlog. The curriculum advances only when a session is completed.
- Three or more days away triggers a gentle restart recommendation: minimum mode with a familiar or easier warm-up.
- Progress is shown as “3/5 learning days this week,” never as a streak that resets to zero.
- Lessons are bundled, deterministic, and usable offline. Daily content does not depend on an LLM.
- Existing solving, judging, AI solutions, and SM-2 review behavior remain available.

## User Experience

### Navigation and default route

Add “Today / 今日” as the first navigation item and make `/today` the default route. Keep Review, Problems, Sync, and Settings unchanged.

### Today page

The top of the page shows:

- the current curriculum day and weekly progress;
- the recommended session mode;
- a gentle restart notice when the previous completion was at least three local calendar days ago;
- a mode switch between standard and minimum mode.

A standard session contains four ordered cards:

1. Review warm-up — about 10 minutes, selected from due SM-2 reviews or a previously solved fallback.
2. DSA micro-lesson — about 15 minutes, with a concise concept, pattern, and common mistake.
3. Core problem — about 40 minutes, one new problem with a progressive three-step hint ladder.
4. Career track — about 20 minutes, usually a GCP data-engineering lesson and periodically a system-design or behavioral exercise.

A minimum session contains only the review warm-up and micro-lesson. Completing it counts as a learning day and advances the curriculum by one day. The omitted coding and career cards are not carried into tomorrow.

The session is created when the user starts it. Reopening Today on the same local date resumes the same session. Changing from standard to minimum mode updates the required tasks without deleting recorded work.

### Completion behavior

- Lesson, GCP, system-design, and behavioral cards have explicit completion buttons.
- Opening a problem navigates to the existing problem page and supplies the active study-session context.
- Marking the matching problem `done` through the existing progress controls automatically completes its Today task.
- A session can be completed only when all tasks required by its current mode are complete.
- Completing a session increments the curriculum day exactly once and updates the weekly count.
- Repeated completion requests are idempotent.

### Progressive hints

When a problem is opened from Today, the problem page shows a compact study panel with three hints. Only the first reveal control is initially visible. Revealing a hint exposes the next reveal control. The existing full AI solution remains available, but the study panel encourages trying the hints first.

### Empty and fallback states

- If no review is due, select an older completed problem as the warm-up.
- If there is no completed problem yet, use a curriculum-provided easy warm-up.
- For the core problem, choose the first not-yet-completed slug from the day’s primary and fallback candidates.
- If every candidate is completed, use the primary problem as a timed review and label it accordingly.

## Curriculum

Bundle a schema-validated 12-week curriculum with 60 core study days. Each day contains:

- a stable day index and title;
- a DSA topic, concise lesson body, pattern summary, and common mistake;
- one primary LeetCode slug and fallback slugs;
- three ordered hints;
- a curriculum-provided easy warm-up slug;
- one career-track item: GCP lesson, system-design prompt, or behavioral prompt.

The curriculum gradually covers arrays and hashing, two pointers, sliding window, stacks, binary search, linked lists, trees, heaps, graphs, backtracking, dynamic programming, and interview review. Career items cover the Professional Data Engineer domains plus data-platform system design and Google-style behavioral preparation. A typical week uses GCP items on days 1–3, a system-design item on day 4, and a review or behavioral item on day 5.

Curriculum validation runs in tests and verifies all 60 indices, unique keys, required content, exactly three non-empty hints, and valid problem slugs.

## Data Model

### `studyProfiles`

- `id`
- `userId`, unique
- `currentDayIndex`, default 0
- `targetDaysPerWeek`, default 5
- `standardMinutes`, default 90
- `minimumMinutes`, default 25
- `lastCompletedAt`, nullable
- timestamps

### `studySessions`

- `id`
- `userId`
- `localDate` (`YYYY-MM-DD` in the app’s local timezone)
- `curriculumDayIndex`
- `mode`: `standard | minimum`
- `status`: `in_progress | completed`
- `coreIsTimedReview`: durable boolean preserving the core selection label across resumes
- `startedAt`, `completedAt`, timestamps
- unique `(userId, localDate)`

### `studyTaskProgress`

- `id`
- `sessionId`
- `taskKey`
- `taskType`: `review | dsa_lesson | problem | gcp | system_design | behavioral`
- `status`: `pending | completed`
- `completedAt`, timestamps
- unique `(sessionId, taskKey)`

Add matching MySQL migration and in-memory SQLite DDL. Because existing desktop databases are not reseeded during upgrades, Electron startup also runs an idempotent desktop schema upgrade that creates the new tables and indexes without altering or deleting user data.

## Server Design

Add a `study` router with these operations:

- `today`: returns the active or preview session, profile, weekly count, gap information, recommended mode, selected problems, curriculum content, and task progress.
- `start`: idempotently creates today’s session and tasks using the current curriculum day.
- `setMode`: switches an in-progress session between standard and minimum and returns the recalculated requirements.
- `completeTask`: completes an explicit non-problem task idempotently.
- `completeSession`: validates required tasks and transactionally completes the session and advances the profile once.

Keep schedule, gap calculation, task construction, and problem-candidate selection in pure functions so they can be tested independently.

Extend `progress.update`: after a problem is marked `done`, complete the active matching study problem task if one exists. This integration must not change normal progress behavior when no study session is active.

All local-desktop calls continue to use the existing local user (`userId = 1`).

## Client Design

Add `TodayPage` using the existing component system and visual language. It includes:

- weekly progress and curriculum-day header;
- standard/minimum mode selector;
- gentle restart banner;
- ordered task cards with estimated time, status, and a single obvious next action;
- session completion control enabled only when requirements are satisfied.

Add a study-context panel to `ProblemDetail`. Today links include the session id and task key in route state or query parameters. The panel renders the curriculum hints and returns the user to Today after the problem task is completed.

Add Chinese and English strings for all new UI. Do not redesign unrelated pages.

## Failure Handling and Data Safety

- Starting, task completion, and session completion are idempotent.
- The unique session-per-local-date constraint prevents duplicate daily sessions.
- Profile advancement and session completion occur in one transaction.
- An interrupted app restart resumes the in-progress session.
- Desktop schema upgrades use `CREATE TABLE IF NOT EXISTS` and never drop or overwrite existing tables.
- Packaged installation preserves the current MySQL database.

## Testing and Acceptance

### Unit tests

- Standard and minimum task requirements.
- No backlog after missed calendar days.
- Curriculum advances once per completed session.
- Three-day gap recommends gentle restart.
- Weekly count uses local dates and caps no behavior artificially.
- Due-review, completed fallback, easy fallback, and completed-core selection.
- Full 60-day curriculum validation.

### Router and database tests

- Starting today is idempotent.
- Reopening today resumes the same session.
- Mode switching recalculates requirements without losing completed tasks.
- Session completion rejects missing required tasks.
- Valid completion updates session and profile exactly once.
- Marking the matching problem done completes its study task.
- Unrelated progress updates do not alter study tasks.
- Desktop schema upgrade is safe to run repeatedly.

### Client tests

- Today renders weekly progress, task order, estimates, and correct next actions.
- Standard/minimum switching updates required cards.
- Gentle restart banner renders from gap data.
- Completion controls follow task state.
- ProblemDetail reveals hints one at a time and retains normal problem behavior.

### Release verification

Run type checking, the full automated test suite, production web build, and Electron packaging. Install the packaged app locally only after they pass. Back up the existing application bundle, preserve the database, then launch the installed app and manually verify:

1. Today opens by default.
2. A standard session can start and resume.
3. Mode can switch to minimum.
4. Lesson completion persists after navigation and restart.
5. A Today problem opens with progressive hints.
6. Marking the problem done updates Today.
7. A fully required session completes and weekly progress increases.
8. Existing Review, Problems, Sync, Settings, judging, and progress flows still work.

## Non-goals for Version 1

- Cloud account synchronization.
- OS notifications or scheduled reminders.
- LLM-generated daily curriculum.
- Punitive streaks, overdue study debt, or forced catch-up.
- Mobile support.
- Replacing the existing judge or AI-solution systems.
