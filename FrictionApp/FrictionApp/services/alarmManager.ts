import { router } from 'expo-router';

// Global set to prevent double navigation to the exact same alarm instance.
const triggeredAlarms = new Set<string>();

export function triggerAlarm(taskId: string, phase: string, params: Record<string, any>) {
    const key = `${taskId}_${phase}`;

    if (triggeredAlarms.has(key)) return;

    triggeredAlarms.add(key);
    // Lock is now permanent for this specific instance-phase combination.
    // This explicitly guarantees that delayed OS background notifications 
    // arriving minutes later will NEVER re-trigger the same phase.
    // If the user reschedules or extends, the lock is manually cleared.

    router.push({
        pathname: '/alarm',
        params: {
            taskId: String(params.taskId),
            taskName: String(params.taskName || ''),
            duration: String(params.duration || ''),
            scheduledTime: String(params.scheduledTime || ''),
            phase: String(phase),
        },
    });
}

// Clear a specific lock instantly if the user interacts and finishes the task early
export function clearAlarmLock(taskId: string, phase: string) {
    triggeredAlarms.delete(`${taskId}_${phase}`);
}
