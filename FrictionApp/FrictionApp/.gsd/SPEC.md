# Task + Reminder Architecture Refactor
Status: FINALIZED

## 1. Overview
The goal is to restructure the task and reminder architecture to a robust, production-ready data model with strict lifecycle logic separating master templates from daily child instances.

## 2. Core Data Model Rules

### Master Tasks Table (`tasks`)
- **Purpose:** Acts as a rule book/template for recurring tasks only.
- **Content:** Contains only tasks with a recurrence rule (daily, weekly, custom, every N days).
- **Rule:** "Once" only tasks NEVER enter this table. They immediately become a child instance.
- **Fields:**
  - Name (used as ID)
  - Time
  - Recurrence option
  - Start Date (default: today or next applicable date)
  - End Date (optional)
  - Points
  - Penalty Points
  - Description
  - Duration (optional)

### Child Instances Table (`task_instances`)
- **Purpose:** Represents the actual daily actionable task.
- **Connection to Master:** Child instances are generated from the Master table based on recurrence rules. 
- **Decoupling:** Any edit to a child instance breaks its connection/sync with the Master task. 
- **Cascading Changes:** Changes to a Master cascade to its connected child instances.
- **Deletion:** Deleting a Master task deletes all *future* child instances (including today's instances if the time has not yet passed).

### Records / History Table (`task_events` / `records`)
- **Purpose:** Immutable audit log organized by Date.
- **Content:** Every activity, state change, and rescheduling event with a timestamp.
- **Rule:** These records are NEVER deleted, even if the Master task or Child instance is deleted.

## 3. Reminder Lifecycle (Phase 1 & Phase 2)

### If Duration is NOT given:
- **Phase 1 Only:** 
  - Reminder shows: "ON-It"
  - If "ON-It" is clicked, it expands to show "Skip" and "Done".
  - "Skip": Task is cut. Applies penalty points (if any).
  - "Done": Applies positive points (if any).

### If Duration IS given:
- **Phase 1 (Start of task):**
  - "Started"
  - "Already done"
  - "Skip"
  - "Reschedule": Shows options to delay by T minutes or a specific time (XX:XX).
- **Phase 2 (End of task duration):**
  - "Done"
  - "Extend": Shows options to extend by T minutes.
  - "Skip"
  - "Reschedule": Reverts the task back to Phase 1.

## 4. UI Actions (Today Tab / Scroll View)
- **Clicking an upcoming task:** Shows "Done" and "Skip".
- **Clicking a Skipped / Unresponsive task:** Shows "Reschedule" (restricted to today only) and "Done".

## 5. Points System
- Calculated based ONLY on the final/current state of all child instances for that day.
- "Once" tasks are treated as normal child instances without a parent.

## 6. Success Criteria
- [ ] Database schema is successfully migrated to support the strict separation.
- [ ] Task creation flow correctly skips the Master table for "Once" tasks.
- [ ] Notification logic correctly handles duration-less tasks vs duration tasks.
- [ ] UI accurately reflects the popup options for Phase 1 and Phase 2 based on task state.
- [ ] Editing a child task safely severs the sync tie from the parent.
- [ ] Deleting a parent correctly purges only the eligible future child tasks.
