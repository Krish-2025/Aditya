# Specification: Task & Reminder Architecture Restructure

## Status
DRAFT (Awaiting User Review to become FINALIZED)

## Core Architecture

### 1. Data Models
**Master Tasks Table (`tasks`)**
- Acts purely as a rule book/template for recurring tasks.
- **Never** stores daily completion state (no `status`, `completionTime`, etc.).
- Required fields: Name (used as ID), Time, Points, Penalty Points, Recurrence rules.
- Optional fields: Duration, Description, Start Date, End Date.
- Recurrence defaults: If no Start Date -> Starts today (if time hasn't passed) else next day. No End Date -> Repeats infinitely.

**Task Instances Table (`task_instances`)**
- "Once-only" tasks skip the Master Table and are created exclusively here.
- Child instances are spawned for all dates according to Master recurrence rules.
- **Connection Logic**:
  - Changes to Master cascade to all connected child instances.
  - If a child instance is modified individually, its connection to the Master is broken (Master updates no longer affect it).
  - Deleting the Master deletes all *future* connected child instances (including today's if its time hasn't passed).

**Records/Audit Log (`task_events` / `records`)**
- Date-wise table logging every activity occurring on a task (state changes, rescheduling, completions).
- Immutable: Records are never modified or deleted, even if the Master or Child instance is deleted.

### 2. Task Lifecycle & Reminders

**Duration Constraints**
- If Duration is **not** provided:
  - Phase 1 Reminder Options: `ON-It` (Started), `Skip`, `Done`.
  - Flow for `ON-It`: Task changes state to Started/Blue, and if clicked again, shows `Skip` and `Done` options.
  - `Skip` applies penalty points, `Done` awards points.

**Phases (With Duration)**
- **Phase 1 Reminder**:
  - `Started`
  - `Already done`
  - `Skip`
  - `Reschedule`: Reveals sub-options to "Delay by T minutes" or "Reschedule to XX:XX time".
- **Phase 2 Reminder**:
  - `Done`
  - `Extend`: reveals option to extend duration by T minutes.
  - `Skip`
  - `Reschedule`: Rolls the state back to Phase 1.

### 3. UI Logic & Views
- **Total Points**: Calculated exclusively based on the final/current states of Child instances for that day.
- **Today Tab / Scroll View Interactions**:
  - Clicking an *upcoming* task box: Shows `Done` and `Skip` actions.
  - Clicking an *already skipped* or *unresponsive* task box: Shows `Reschedule` (restricted to today only) and `Done` actions.

## Acceptance Criteria
- [ ] Database schema updated to strictly separate templates (tasks) from executions (instances).
- [ ] Master table editing correctly cascades to instances unless instance is disconnected.
- [ ] Master deletion strictly purges future instances without affecting history.
- [ ] Task creation flow defaults to "Once", routing correctly.
- [ ] Reminder logic correctly diverges based on presence of Duration.
- [ ] UI action sheets correctly reflect available options based on task state and phase.
