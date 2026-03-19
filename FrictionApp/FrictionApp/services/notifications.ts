import * as Notifications from 'expo-notifications';

type AlarmPhase = 'phase1' | 'phase2';

export async function ensureNotificationsPermissions(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const next = await Notifications.requestPermissionsAsync();
  return next.granted;
}

export function getLocalDateFromParts(dateStr: string, time24: string): Date | null {
  if (!dateStr || !time24) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = time24.split(':').map(Number);
  if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

export async function cancelNotificationById(id?: string | null) {
  if (!id) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // ignore
  }
}

export async function cancelAllScheduledNotifications() {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // ignore
  }
}

export async function scheduleAlarmNotification(opts: {
  taskId: string;
  taskName: string;
  durationMinutes: number;
  scheduledTime: string;
  phase: AlarmPhase;
  fireAt: Date;
}) {
  const diffMs = opts.fireAt.getTime() - Date.now();
  if (diffMs <= 0) {
    return undefined;
  }
  const seconds = Math.max(1, Math.round(diffMs / 1000));

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: opts.phase === 'phase1' ? 'Task Reminder' : "Time's up",
      body:
        opts.phase === 'phase1'
          ? `${opts.taskName} • ${opts.durationMinutes} min`
          : `How did "${opts.taskName}" go?`,
      sound: true,
      priority: Notifications.AndroidNotificationPriority.MAX,
      data: {
        route: '/alarm',
        taskId: opts.taskId,
        taskName: opts.taskName,
        duration: String(opts.durationMinutes),
        scheduledTime: opts.scheduledTime,
        phase: opts.phase,
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: opts.fireAt,
    },
  });
  return id;
}

