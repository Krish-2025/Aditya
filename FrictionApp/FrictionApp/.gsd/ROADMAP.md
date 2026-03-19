# Roadmap: Task Architecture Restructure

## Phase 1: Database & Data Model Restructuring
- Restructure `services/database.ts` schema:
  - Remove state tracking from `tasks` table.
  - Update `tasks` with `startDate` and `endDate`.
  - Add connection tracking feature `isDisconnected` on `task_instances` table.
  - Ensure `task_history`/`task_events` act as the unchangeable immutable ledger.
- Update CRUD functions:
  - Add logic to generate instances based on `startDate` and `endDate`.
  - Implemenet logic where "Once" tasks bypass `tasks` table and only insert into `task_instances`.
  - Fix cascading updates from Master to connected Child instances.
  - Update Master deletion to only affect future instances.

## Phase 2: Refactoring Task Creation & UI
- Update `CreateTaskModal` in `modal.tsx`:
  - Default recurrence to "Once".
  - Add Start Date and End Date inputs conditionally when recurrence is selected.
  - Make duration strictly optional and update UI accordingly.
  - Ensure task name acts as ID correctly.
- Refactor the total points calculation on the home page to purely read from `task_instances`.

## Phase 3: Lifecycle, Background Tasks, & Reminders Implementation
- Update phase reminder engine (either background tasks or UI triggers):
  - Handle logic differentiation when `duration` is absent.
  - Implement Phase 1 actions: `Started` (ON-It), `Already done`, `Skip`, `Reschedule` options.
  - Implement Phase 2 actions: `Done`, `Extend`, `Skip`, `Reschedule` back to Phase 1.

## Phase 4: UI Interaction States (Today Tab)
- Modify the `TaskItem` / `TaskBlock` components:
  - Upcoming Task Click: Show `Done` and `Skip`.
  - Skipped/Unresponsive Task Click: Show `Reschedule` (today only) and `Done`.

## Phase 5: Testing & Empirical Validation
- Verify schema migrations.
- Verify "Once" task creation.
- Verify Recurrence start/end bounds.
- Verify connection breaking logic between Master and Child.
- Verify reminder phase interactions.
