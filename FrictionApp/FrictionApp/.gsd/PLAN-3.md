# Phase 3: UI Integration

The goal of Phase 3 is to integrate the frontend components (`trace`, `edit-task`, and `manage`) and their states with the new backend changes introduced in Phase 1 and 2.

## Proposed Changes

### UI Components Layer
#### [MODIFY] `app/(tabs)/trace.tsx` (Today / Core rendering)
- Update list rendering query to fetch natively from `task_instances` filtered for Today explicitly.
- Display popup logic on item press. Provide unique context rendering based on the status flags (Upcoming, Skipped, Unresponsive).
- Render `Done` and `Skip` based on `duration: null` logic handling.

#### [MODIFY] `app/edit-task.tsx`
- Ensure form dynamically switches payload depending on 'Once' drop down selection.
- Make 'Once' the default recurrence value for new task payload bindings.
- Remove tracking state fields passed back to `tasks` if recurrence is defined.
- Provide options to add Start/End Date explicitly for Recurring Tasks.

#### [MODIFY] `app/(tabs)/manage.tsx` (Template Master list)
- Render all recurring `tasks` here. 'Once' tasks should inherently NOT appear in this list since they aren't templates.

## Verification Plan

### Automated Tests
- Validate TypeScript adherence for all property destructurings passed from the SQLite hooks into the React context.

### Manual Verification
- Open Trace screen, tap an upcoming "Duration-less" task, and verify only phase 1 popup options display without duration UI inputs.
- Create a "Daily" template task in Manage, ensure it populates in Trace for today.
- Edit default daily task. Verify the `manage` screen edits cascade appropriately in today's `trace` if it hasn't been explicitly handled previously.
