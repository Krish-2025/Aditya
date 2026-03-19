import * as SQLite from 'expo-sqlite';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('frictionapp_v5.db');
  }
  return dbPromise;
}

let initPromise: Promise<void> | null = null;

export function initDatabase(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const db = await getDb();

    // Enable Write-Ahead Logging to allow concurrent readers/writers
    // and increase busy timeout so queries wait politely instead of crashing immediately.
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      PRAGMA synchronous = NORMAL;
    `);

    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        startDate TEXT,
        endDate TEXT,
        scheduledTime TEXT NOT NULL,
        duration INTEGER,
        points INTEGER NOT NULL DEFAULT 10,
        penaltyPoints INTEGER NOT NULL DEFAULT 0,
        recurrence TEXT DEFAULT 'once',
        recurrenceValue INTEGER DEFAULT 1,
        recurrenceDays TEXT DEFAULT '',
        soundName TEXT DEFAULT 'default',
        createdAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS task_history (
        id TEXT PRIMARY KEY,
        taskId TEXT NOT NULL,
        taskName TEXT NOT NULL,
        scheduledDate TEXT,
        scheduledTime TEXT NOT NULL,
        duration INTEGER,
        points INTEGER NOT NULL DEFAULT 0,
        penaltyPoints INTEGER NOT NULL DEFAULT 0,
        pointsEarned INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        startTime TEXT,
        completionTime TEXT,
        extensions INTEGER DEFAULT 0,
        rescheduleCount INTEGER DEFAULT 0,
        responseLatency INTEGER,
        responseLatencyStart INTEGER,
        responseLatencyCompletion INTEGER,
        skipReason TEXT,
        date TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS task_instances (
        id TEXT PRIMARY KEY,
        parentTaskId TEXT NOT NULL,
        date TEXT NOT NULL,
        scheduledTime TEXT NOT NULL,
        duration INTEGER,
        status TEXT DEFAULT 'SCHEDULED',
        points INTEGER NOT NULL DEFAULT 10,
        penaltyPoints INTEGER NOT NULL DEFAULT 0,
        pointsEarned INTEGER DEFAULT 0,
        startTime TEXT,
        completionTime TEXT,
        extensions INTEGER DEFAULT 0,
        rescheduleCount INTEGER DEFAULT 0,
        responseLatency INTEGER,
        responseLatencyStart INTEGER,
        responseLatencyCompletion INTEGER,
        skipReason TEXT,
        soundName TEXT DEFAULT 'default',
        notifPhase1Id TEXT,
        notifPhase2Id TEXT,
        isDisconnected INTEGER DEFAULT 0,
        createdAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS task_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        taskName TEXT NOT NULL,
        eventType TEXT NOT NULL,
        eventData TEXT DEFAULT '{}',
        timestamp TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sleep_logs (
        id TEXT PRIMARY KEY,
        sleepTime TEXT,
        wakeTime TEXT,
        overrideReason TEXT,
        createdAt TEXT NOT NULL
      );
    `);

    // Legacy migrations removed - taking advantage of v5 clean slate

  })();

  return initPromise;
}

// ──────────────────────────────────────────────────────
// Utility
// ──────────────────────────────────────────────────────

/** Returns 'YYYY-MM-DD' in the device's local timezone (not UTC). */
export function getLocalDateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Clears all data. */
export async function clearAllData() {
  const db = await getDb();
  await db.runAsync(`DELETE FROM tasks`);
  await db.runAsync(`DELETE FROM task_history`);
  await db.runAsync(`DELETE FROM task_instances`);
  await db.runAsync(`DELETE FROM task_events`);
  await db.runAsync(`DELETE FROM sleep_logs`);
}

/** Clears all data generated today. */
export async function clearTodaysData() {
  const db = await getDb();
  const todayStr = getLocalDateStr();

  // Clean OS notifications first for today's instances
  const instances = await db.getAllAsync(`SELECT * FROM task_instances WHERE date = ?`, todayStr) as any[];
  for (const inst of instances) {
    await cancelInstanceNotifications(inst);
  }

  await db.withTransactionAsync(async () => {
    // Clear instances and history that belong to today
    await db.runAsync(`DELETE FROM task_instances WHERE date = ?`, todayStr);
    await db.runAsync(`DELETE FROM task_history WHERE date = ?`, todayStr);

    // Clear ANY tasks (reminders) created today
    const allTasks = await db.getAllAsync(`SELECT id, createdAt FROM tasks`) as any[];
    for (const t of allTasks) {
      if (getLocalDateStr(new Date(t.createdAt)) === todayStr) {
        await db.runAsync(`DELETE FROM tasks WHERE id = ?`, t.id);
      }
    }

    // Clear sleep logs recorded today
    const allSleep = await db.getAllAsync(`SELECT id, createdAt FROM sleep_logs`) as any[];
    for (const s of allSleep) {
      if (getLocalDateStr(new Date(s.createdAt)) === todayStr) {
        await db.runAsync(`DELETE FROM sleep_logs WHERE id = ?`, s.id);
      }
    }

    // Clear audit events from today (requires rowid, as task_events has no explicit pk)
    const allEvents = await db.getAllAsync(`SELECT rowid, timestamp FROM task_events`) as any[];
    for (const e of allEvents) {
      if (getLocalDateStr(new Date(e.timestamp)) === todayStr) {
        await db.runAsync(`DELETE FROM task_events WHERE rowid = ?`, e.rowid);
      }
    }
  });
}

/** Clears recent data from the last T minutes. */
export async function clearRecentData(minutes: number) {
  if (minutes <= 0) return;
  const db = await getDb();
  const thresholdMs = Date.now() - minutes * 60000;
  const threshold = new Date(thresholdMs).toISOString();

  // Clean OS notifications first for recently created blocks
  const instances = await db.getAllAsync(`SELECT * FROM task_instances WHERE createdAt >= ?`, threshold) as any[];
  for (const inst of instances) {
    await cancelInstanceNotifications(inst);
  }

  await db.runAsync(`DELETE FROM task_instances WHERE createdAt >= ?`, threshold);
  await db.runAsync(`DELETE FROM tasks WHERE createdAt >= ?`, threshold);
  await db.runAsync(`DELETE FROM sleep_logs WHERE createdAt >= ?`, threshold);
  await db.runAsync(`DELETE FROM task_events WHERE timestamp >= ?`, threshold);
}


/** Log an event to the task_events audit table. */
export async function logTaskEvent(taskName: string, eventType: string, eventData?: Record<string, any>) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO task_events (taskName, eventType, eventData, timestamp) VALUES (?, ?, ?, ?)`,
    taskName,
    eventType,
    JSON.stringify(eventData || {}),
    new Date().toISOString()
  );
}

/** Check if a task name is already taken. */
export async function isTaskNameTaken(name: string): Promise<boolean> {
  const db = await getDb();
  const rows = (await db.getAllAsync(`SELECT id FROM tasks WHERE name = ?`, name)) as any[];
  return rows.length > 0;
}

/** Logs an emergency freeze cycle into the permanent task history. */
export async function logEmergencyHistory(startTime: string, endTime: string, durationMinutes: number, reason: string = 'Emergency Lock Active') {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO task_history (id, taskId, taskName, scheduledTime, duration, points, penaltyPoints, pointsEarned, status, startTime, completionTime, date, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    `emergency_${Date.now()}`,
    'emergency_lock',
    reason,
    startTime.substring(11, 16), // HH:mm
    Math.round(durationMinutes),
    0, 0, 0,
    'EMERGENCY',
    startTime,
    endTime,
    startTime.substring(0, 10), // YYYY-MM-DD
    new Date().toISOString()
  );
}

// ──────────────────────────────────────────────────────
// Parent task CRUD (templates)
// ──────────────────────────────────────────────────────

export async function addTask(task: {
  name: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  scheduledTime: string;
  duration?: number;
  points: number;
  penaltyPoints?: number;
  recurrence: string;
  recurrenceValue?: number;
  recurrenceDays?: string;
  soundName?: string;
}) {
  const db = await getDb();
  const todayStr = getLocalDateStr();

  if (task.recurrence === 'once') {
    const instId = `${task.name}::${todayStr}`;
    await db.runAsync(
      `INSERT INTO task_instances(id, parentTaskId, date, scheduledTime, duration, status, points, penaltyPoints, pointsEarned, startTime, completionTime, extensions, rescheduleCount, responseLatency, responseLatencyStart, responseLatencyCompletion, skipReason, soundName, notifPhase1Id, notifPhase2Id, isDisconnected, createdAt) VALUES(?, ?, ?, ?, ?, 'SCHEDULED', ?, ?, 0, NULL, NULL, 0, 0, NULL, NULL, NULL, NULL, ?, NULL, NULL, 0, ?)`,
      [
        instId,
        task.name,
        todayStr,
        task.scheduledTime,
        task.duration ?? null,
        task.points,
        task.penaltyPoints ?? 0,
        task.soundName ?? 'default',
        new Date().toISOString()
      ]
    );
    await logTaskEvent(task.name, 'CREATED_ONCE', { scheduledTime: task.scheduledTime, duration: task.duration });
  } else {
    const startDate = task.startDate || todayStr;
    await db.runAsync(
      `INSERT INTO tasks(id, name, description, startDate, endDate, scheduledTime, duration, points, penaltyPoints, recurrence, recurrenceValue, recurrenceDays, soundName, createdAt) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        task.name,
        task.name,
        task.description ?? '',
        startDate,
        task.endDate ?? null,
        task.scheduledTime,
        task.duration ?? null,
        task.points,
        task.penaltyPoints ?? 0,
        task.recurrence,
        task.recurrenceValue ?? 1,
        task.recurrenceDays ?? '',
        task.soundName ?? 'default',
        new Date().toISOString()
      ]
    );
    await logTaskEvent(task.name, 'CREATED', { scheduledTime: task.scheduledTime, duration: task.duration, recurrence: task.recurrence });
  }
}

export async function getTasks(): Promise<any[]> {
  const db = await getDb();
  return (await db.getAllAsync(`SELECT * FROM tasks ORDER BY scheduledTime ASC`)) as any[];
}

export async function getTaskById(id: string): Promise<any | null> {
  const db = await getDb();
  const tasks = (await db.getAllAsync(`SELECT * FROM tasks WHERE id = ? `, id)) as any[];
  return tasks[0] ?? null;
}

export async function updateTask(id: string, fields: Record<string, any>) {
  const db = await getDb();
  const keys = Object.keys(fields);
  const values = Object.values(fields);
  const setClause = keys.map((k) => `${k} = ?`).join(', ');
  await db.runAsync(`UPDATE tasks SET ${setClause} WHERE id = ? `, ...values, id);
}

export async function updateTaskFull(task: {
  id: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  scheduledTime: string;
  duration?: number;
  points: number;
  penaltyPoints: number;
  recurrence: string;
  recurrenceValue: number;
  recurrenceDays: string;
  soundName: string;
}) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE tasks SET description =?, startDate =?, endDate =?, scheduledTime =?, duration =?, points =?, penaltyPoints =?, recurrence =?, recurrenceValue =?, recurrenceDays =?, soundName =? WHERE id =? `,
      [
        task.description ?? '',
        task.startDate ?? null,
        task.endDate ?? null,
        task.scheduledTime,
        task.duration ?? null,
        task.points,
        task.penaltyPoints,
        task.recurrence,
        task.recurrenceValue,
        task.recurrenceDays,
        task.soundName,
        task.id
      ]
    );
    // Find connected instances to cancel their notifications before updating
    const instances = await db.getAllAsync(
      `SELECT * FROM task_instances WHERE parentTaskId = ? AND isDisconnected = 0 AND status = 'SCHEDULED'`,
      [task.id]
    );
    for (const inst of instances as any[]) {
      await cancelInstanceNotifications(inst);
    }

    // Cascade to connected instances and clear their notification IDs so the UI reschedules them
    await db.runAsync(
      `UPDATE task_instances SET scheduledTime =?, duration =?, points =?, penaltyPoints =?, soundName =?, notifPhase1Id = NULL, notifPhase2Id = NULL WHERE parentTaskId =? AND isDisconnected = 0 AND status = 'SCHEDULED'`,
      [
        task.scheduledTime,
        task.duration ?? null,
        task.points,
        task.penaltyPoints,
        task.soundName,
        task.id
      ]
    );
  });
  await logTaskEvent(task.id, 'EDITED', { scheduledTime: task.scheduledTime, duration: task.duration });
}

export async function deleteTask(id: string) {
  const db = await getDb();
  const t = (await db.getAllAsync(`SELECT name FROM tasks WHERE id = ? `, id)) as any[];

  // Delete only FUTURE instances or today's if they haven't been completed/started.
  const todayStr = getLocalDateStr();

  const futureInstances = (await db.getAllAsync(
    `SELECT id, notifPhase1Id, notifPhase2Id FROM task_instances WHERE parentTaskId = ? AND date >= ? AND status = 'SCHEDULED'`, [id, todayStr]
  )) as any[];

  for (const inst of futureInstances) {
    try {
      const Notifications = require('expo-notifications');
      if (inst.notifPhase1Id) await Notifications.cancelScheduledNotificationAsync(inst.notifPhase1Id);
      if (inst.notifPhase2Id) await Notifications.cancelScheduledNotificationAsync(inst.notifPhase2Id);
    } catch { }
  }

  await db.runAsync(
    `DELETE FROM task_instances WHERE parentTaskId = ? AND date >= ? AND status = 'SCHEDULED'`, [id, todayStr]
  );

  await db.runAsync(`DELETE FROM tasks WHERE id = ? `, id);
  await logTaskEvent(t[0]?.name || id, 'DELETED');
}

// ──────────────────────────────────────────────────────
// Task instances (child — per-day execution)
// ──────────────────────────────────────────────────────

/** Build the deterministic instance ID for a parent + date. */
function instanceId(parentTaskId: string, date: string): string {
  return `${parentTaskId}::${date} `;
}

/** Check if a parent task should run on a given date. */
function shouldTaskRunOnDate(task: any, date: Date): boolean {
  const dateStr = getLocalDateStr(date);
  if (task.startDate && dateStr < task.startDate) return false;
  if (task.endDate && dateStr > task.endDate) return false;

  const dayOfWeek = date.getDay();
  if (task.recurrence === 'daily') return true;
  if (task.recurrence === 'weekly') {
    const days = task.recurrenceDays ? task.recurrenceDays.split(',').map(Number) : [];
    return days.includes(dayOfWeek);
  }
  if (task.recurrence === 'custom_days') {
    const created = new Date(task.createdAt);
    const baseline = task.startDate ? new Date(`${task.startDate}T00:00:00`) : created;
    const diffDays = Math.floor((date.getTime() - baseline.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return false;
    return diffDays % (task.recurrenceValue || 1) === 0;
  }
  return true;
}

let generateInstancesPromise: Promise<void> | null = null;

/** Generate today's instances from parent tasks. Only creates if none exist yet.
 *  Respects recurrence rules — weekly/custom_days tasks only get instances on matching days. */
export function generateTodayInstances(targetDateStr?: string): Promise<void> {
  if (generateInstancesPromise) return generateInstancesPromise;

  generateInstancesPromise = (async () => {
    try {
      await initDatabase(); // Ensure schema exists first
      const db = await getDb();

      const todayStr = targetDateStr || getLocalDateStr();
      const today = targetDateStr ? new Date(`${targetDateStr}T12:00:00Z`) : new Date();

      const allTasks = (await db.getAllAsync(`SELECT * FROM tasks`)) as any[];

      // Get IDs of instances that already exist for today
      const existingRows = (await db.getAllAsync(
        `SELECT id FROM task_instances WHERE date = ? `, todayStr
      )) as { id: string }[];
      const existingIds = new Set(existingRows.map(r => r.id));

      // Use a single transaction to prevent locking overhead on massive inserts
      await db.withTransactionAsync(async () => {
        for (const task of allTasks) {
          // Skip clone tasks from the old architecture (they have _resched_ in the ID)
          if (task.id.includes('_resched_')) continue;

          if (!shouldTaskRunOnDate(task, today)) continue;

          const instId = instanceId(task.id, todayStr);
          if (existingIds.has(instId)) continue;

          await db.runAsync(
            `INSERT INTO task_instances(id, parentTaskId, date, scheduledTime, duration, status, points, penaltyPoints, pointsEarned, startTime, completionTime, extensions, rescheduleCount, responseLatency, responseLatencyStart, responseLatencyCompletion, skipReason, soundName, notifPhase1Id, notifPhase2Id, isDisconnected, createdAt) VALUES(?, ?, ?, ?, ?, 'SCHEDULED', ?, ?, 0, NULL, NULL, 0, 0, NULL, NULL, NULL, NULL, ?, NULL, NULL, 0, ?)`,
            [
              instId,
              task.id,
              todayStr,
              task.scheduledTime,
              task.duration ?? null,
              task.points,
              task.penaltyPoints ?? 0,
              task.soundName ?? 'default',
              new Date().toISOString()
            ]
          );
        }
      });
    } finally {
      generateInstancesPromise = null;
    }
  })();

  return generateInstancesPromise;
}

/** Get all instances for a specific day (defaults to today). */
export async function getTodayInstances(targetDateStr?: string): Promise<any[]> {
  const db = await getDb();
  const todayStr = targetDateStr || getLocalDateStr();
  return (await db.getAllAsync(
    `SELECT i.*, t.name, t.description, t.recurrence FROM task_instances i LEFT JOIN tasks t ON i.parentTaskId = t.id WHERE i.date = ? ORDER BY i.scheduledTime ASC`,
    todayStr
  )) as any[];
}

/** Get a single instance by ID. */
export async function getInstanceById(id: string): Promise<any | null> {
  const db = await getDb();
  const rows = (await db.getAllAsync(
    `SELECT i.*, t.name, t.description, t.recurrence FROM task_instances i LEFT JOIN tasks t ON i.parentTaskId = t.id WHERE i.id = ? `,
    id
  )) as any[];
  return rows[0] ?? null;
}

/** Generic field updater for instances. */
export async function updateInstance(id: string, fields: Record<string, any>) {
  const db = await getDb();
  // Mark as disconnected if edited directly
  fields.isDisconnected = 1;
  const keys = Object.keys(fields);
  const values = Object.values(fields);
  const setClause = keys.map((k) => `${k} = ?`).join(', ');
  await db.runAsync(`UPDATE task_instances SET ${setClause} WHERE id = ? `, ...values, id);
}

// ──────────────────────────────────────────────────────
// Instance actions
// ──────────────────────────────────────────────────────

/** Calculate pointsEarned based on status and store it. */
function calculatePoints(instance: any): number {
  const isCompleted = instance.status === 'COMPLETED' || instance.status === 'COMPLETED_EARLY';
  const isFailed = ['FAILED', 'SKIPPED', 'UNRESPONSIVE_START', 'UNRESPONSIVE_COMPLETION'].includes(instance.status);
  if (isCompleted) return instance.points;
  if (isFailed && instance.penaltyPoints > 0) return -instance.penaltyPoints;
  return 0;
}

/** Auto-delete the parent task if it's a one-time ('once') task and its instance is at finality. */
async function cleanupOnceParentIfDone(instanceId: string) {
  const db = await getDb();
  const inst = await getInstanceById(instanceId);
  if (!inst) return;
  // Look up the parent task
  const parents = (await db.getAllAsync(`SELECT id, recurrence FROM tasks WHERE id = ? `, inst.parentTaskId)) as any[];
  const parent = parents[0];
  if (!parent || parent.recurrence !== 'once') return;
  // Delete the parent task template (instance data is preserved for history)
  await db.runAsync(`DELETE FROM tasks WHERE id = ? `, parent.id);
  await logTaskEvent(inst.name || inst.parentTaskId, 'AUTO_DELETED_ONCE', { instanceId, parentTaskId: parent.id });
}

/** Reschedule an instance to a new time. Only modifies this instance — parent is never touched. */
export async function rescheduleInstance(instanceId: string, newTime: string) {
  const db = await getDb();
  const inst = await getInstanceById(instanceId);
  if (!inst) return;

  await cancelInstanceNotifications(inst);

  await db.runAsync(
    `UPDATE task_instances SET scheduledTime =?, rescheduleCount =?, status = 'RESCHEDULED', startTime = NULL, completionTime = NULL, notifPhase1Id = NULL, notifPhase2Id = NULL WHERE id =? `,
    [newTime,
      (inst.rescheduleCount ?? 0) + 1,
      instanceId]
  );
  await logTaskEvent(inst.name || inst.parentTaskId, 'RESCHEDULED', { instanceId, newTime, rescheduleCount: (inst.rescheduleCount ?? 0) + 1 });
}

/** Extend an instance's duration. */
export async function extendInstance(instanceId: string, extraMinutes: number) {
  const db = await getDb();
  const inst = await getInstanceById(instanceId);
  if (!inst) return;
  const newDuration = inst.duration + extraMinutes;
  const newExtensions = (inst.extensions ?? 0) + 1;
  await db.runAsync(
    `UPDATE task_instances SET duration =?, extensions =? WHERE id =? `,
    [newDuration, newExtensions, instanceId]
  );
  await logTaskEvent(inst.name || inst.parentTaskId, 'EXTENDED', { instanceId, extraMinutes, newDuration, extensionCount: newExtensions });
}

/** Cancel any pending notifications for an instance securely. */
export async function cancelInstanceNotifications(instance: any) {
  if (!instance) return;
  try {
    const Notifications = require('expo-notifications');
    if (instance.notifPhase1Id) await Notifications.cancelScheduledNotificationAsync(instance.notifPhase1Id);
    if (instance.notifPhase2Id) await Notifications.cancelScheduledNotificationAsync(instance.notifPhase2Id);
  } catch { }
}

/** Complete an instance (Phase 2 completion or early completion from Today tab). */
export async function completeInstance(instanceId: string, isEarly: boolean = false) {
  const db = await getDb();
  const inst = await getInstanceById(instanceId);
  if (!inst) return;
  const status = isEarly ? 'COMPLETED_EARLY' : 'COMPLETED';
  const pointsEarned = inst.points;

  await cancelInstanceNotifications(inst);

  await db.runAsync(
    `UPDATE task_instances SET status =?, completionTime =?, pointsEarned =?, notifPhase1Id = NULL, notifPhase2Id = NULL WHERE id =? `,
    [status,
      new Date().toISOString(),
      pointsEarned,
      instanceId]
  );
  await logTaskEvent(inst.name || inst.parentTaskId, status, { instanceId, pointsEarned, isEarly });
  await cleanupOnceParentIfDone(instanceId);
}

/** Mark an unresponsive instance as completed (recovery from Today tab). */
export async function markInstanceDone(instanceId: string) {
  const db = await getDb();
  const inst = await getInstanceById(instanceId);
  if (!inst) return;

  await cancelInstanceNotifications(inst);

  await db.runAsync(
    `UPDATE task_instances SET status = 'COMPLETED', completionTime =?, pointsEarned =?, notifPhase1Id = NULL, notifPhase2Id = NULL WHERE id =? `,
    [new Date().toISOString(),
    inst.points,
      instanceId]
  );
  await logTaskEvent(inst.name || inst.parentTaskId, 'MARKED_COMPLETED', { instanceId, pointsEarned: inst.points, previousStatus: inst.status });
  await cleanupOnceParentIfDone(instanceId);
}

/** Skip an instance. */
export async function skipInstance(instanceId: string, skipReason?: string) {
  const db = await getDb();
  const inst = await getInstanceById(instanceId);
  if (!inst) return;

  await cancelInstanceNotifications(inst);

  const pointsEarned = inst.penaltyPoints > 0 ? -inst.penaltyPoints : 0;
  await db.runAsync(
    `UPDATE task_instances SET status = 'SKIPPED', skipReason =?, pointsEarned =?, notifPhase1Id = NULL, notifPhase2Id = NULL WHERE id =? `,
    [skipReason ?? null,
      pointsEarned,
      instanceId]
  );
  await logTaskEvent(inst.name || inst.parentTaskId, 'SKIPPED', { instanceId, skipReason, pointsEarned });
  await cleanupOnceParentIfDone(instanceId);
}

/** Fail an instance (Phase 2 — didn't complete in time). */
export async function failInstance(instanceId: string) {
  const db = await getDb();
  const inst = await getInstanceById(instanceId);
  if (!inst) return;

  await cancelInstanceNotifications(inst);

  const pointsEarned = inst.penaltyPoints > 0 ? -inst.penaltyPoints : 0;
  await db.runAsync(
    `UPDATE task_instances SET status = 'FAILED', pointsEarned =?, notifPhase1Id = NULL, notifPhase2Id = NULL WHERE id =? `,
    [pointsEarned,
      instanceId]
  );
  await logTaskEvent(inst.name || inst.parentTaskId, 'FAILED', { instanceId, pointsEarned });
  await cleanupOnceParentIfDone(instanceId);
}

/** Auto-skip an instance due to no response. */
export async function autoSkipInstance(instanceId: string, phase: 'phase1' | 'phase2', latency: number) {
  const db = await getDb();
  const inst = await getInstanceById(instanceId);
  if (!inst) return;

  await cancelInstanceNotifications(inst);

  const status = phase === 'phase1' ? 'UNRESPONSIVE_START' : 'UNRESPONSIVE_COMPLETION';
  const pointsEarned = inst.penaltyPoints > 0 ? -inst.penaltyPoints : 0;
  await db.runAsync(
    `UPDATE task_instances SET status =?, responseLatency =?, pointsEarned =?, ${phase === 'phase1' ? 'responseLatencyStart' : 'responseLatencyCompletion'}=?, notifPhase1Id = NULL, notifPhase2Id = NULL WHERE id =? `,
    status,
    latency,
    pointsEarned,
    latency,
    instanceId
  );
  await logTaskEvent(inst.name || inst.parentTaskId, status, { instanceId, latency, phase, autoSkipped: true });
  await cleanupOnceParentIfDone(instanceId);
}

// ──────────────────────────────────────────────────────
// Points & History (now reading from task_instances)
// ──────────────────────────────────────────────────────

export async function getTotalPointsEarned(): Promise<number> {
  const db = await getDb();
  // Sum from both legacy history and new instances
  const legacyResult = (await db.getAllAsync(`SELECT SUM(pointsEarned) as total FROM task_history`)) as any[];
  const instanceResult = (await db.getAllAsync(`SELECT SUM(pointsEarned) as total FROM task_instances`)) as any[];
  return (legacyResult[0]?.total ?? 0) + (instanceResult[0]?.total ?? 0);
}

/** Get total points earned for a specific day, computed live from child instances. */
export async function getTodayPointsEarned(targetDateStr?: string): Promise<number> {
  const db = await getDb();
  const todayStr = targetDateStr || getLocalDateStr();
  const result = (await db.getAllAsync(
    `SELECT SUM(pointsEarned) as total FROM task_instances WHERE date = ? `, todayStr
  )) as any[];
  return result[0]?.total ?? 0;
}

export async function getPointsByDate(): Promise<any[]> {
  const db = await getDb();
  // Combine legacy and instances
  return (await db.getAllAsync(
    `SELECT date, SUM(pointsEarned) as points FROM(
  SELECT date, pointsEarned FROM task_history
       UNION ALL
       SELECT date, pointsEarned FROM task_instances
) GROUP BY date ORDER BY date ASC`
  )) as any[];
}

export async function getTaskEvents(taskName?: string): Promise<any[]> {
  const db = await getDb();
  if (taskName) {
    return (await db.getAllAsync(`SELECT * FROM task_events WHERE taskName = ? ORDER BY timestamp DESC`, taskName)) as any[];
  }
  return (await db.getAllAsync(`SELECT * FROM task_events ORDER BY timestamp DESC`)) as any[];
}

// ──────────────────────────────────────────────────────
// Sleep logs (unchanged)
// ──────────────────────────────────────────────────────

export async function addSleepLog(log: {
  id: string;
  sleepTime?: string;
  wakeTime?: string;
  overrideReason?: string;
}) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO sleep_logs(id, sleepTime, wakeTime, overrideReason, createdAt) VALUES(?, ?, ?, ?, ?)`,
    log.id,
    log.sleepTime ?? null,
    log.wakeTime ?? null,
    log.overrideReason ?? null,
    new Date().toISOString()
  );
}

export async function getSleepLogs(): Promise<any[]> {
  const db = await getDb();
  return (await db.getAllAsync(`SELECT * FROM sleep_logs ORDER BY createdAt DESC`)) as any[];
}
