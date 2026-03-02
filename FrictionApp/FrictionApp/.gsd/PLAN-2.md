# Phase 2: Action Lifecycle & Points Logic

The goal of Phase 2 is to handle state machine logic for Tasks depending on the Reminder lifecycle phases, and ensure total point computation strictly relies on child instances.

## Proposed Changes

### Logic Layer
#### [MODIFY] manage.tsx or helper logic for tasks
- **Lifecycle actions implementation**:
  - `ON-It` -> Transitions to `STARTED`
  - `Skip` -> Transitions to `SKIPPED`, negative points applied
  - `Done` -> Transitions to `COMPLETED`, positive points applied
  - `Already done` -> Maps to early `COMPLETED`
  - `Reschedule` -> Modifies `scheduledTime` of the `task_instances`, tracking attempt count
  - `Extend` -> Modifies `duration`
- **Master Parent Sync**:
  - Editing a child instance (e.g., rescheduling) explicitly unbinds the `task_instances` entry from the upstream master parent changes.
- **Points Logic**:
  - Total Points will aggregate purely from `task_instances` based on day finality states (e.g. `COMPLETED`, `SKIPPED`, `FAILED`).
  - Tasks with no parent ('Once' tasks) act as standalone instances within this aggregation.

## Verification Plan

### Automated Tests
- Verify TypeScript compilation for `Task` status types and properties (e.g., adding `ON-It` flag compatibility).

### Manual Verification
- Simulate a task running out of duration and hitting Phase 2.
- Verify that 'Extend' triggers the correct duration push.
- Verify 'Once' tasks properly register points for the day.
