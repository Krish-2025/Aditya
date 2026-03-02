# Project Roadmap

> Generated for Architecture Refactor

## Phase 1: Storage Layer Re-Architecture
- **Focus**: Updating the SQLite schema and CRUD operations.
- **Goals**: 
  - Update `tasks` (Master table).
  - Update `task_instances` (Child table).
  - Update `task_events` (History/Records table).
  - Separate `recurrence: 'once'` from entering `tasks`.

## Phase 2: Action Lifecycle & Points Logic
- **Focus**: Ensuring state changes flow correctly.
- **Goals**:
  - Implement Phase 1 actions: 'ON-It', 'Started', 'Already done', 'Skip', 'Reschedule'.
  - Implement Phase 2 actions (duration-based): 'Done', 'Extend', 'Skip', 'Reschedule'.
  - Update points calculation to purely rely on `task_instances`.
  - Fix cascading rules (e.g. Master deletion deletes future instances, Master edit updates instances unless connection broken).

## Phase 3: UI Integration
- **Focus**: Updating the frontend to reflect new state capabilities.
- **Goals**:
  - Update `Trace` (Today tab) to handle instance-based rendering.
  - Implement the specific UI option popups for different states (Upcoming, Skipped, etc.).
  - Update the `edit-task` component to properly set "Once" vs recurring configurations.
