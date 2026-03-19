import { checkEmergencyMode, EMERGENCY_EVENT } from '@/components/EmergencySpiral';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppTheme } from '@/constants/theme';
import { clearAlarmLock, triggerAlarm } from '@/services/alarmManager';
import { cancelInstanceNotifications, completeInstance, generateTodayInstances, getInstanceById, getLocalDateStr, getTodayInstances, getTodayPointsEarned, initDatabase, markInstanceDone, rescheduleInstance, skipInstance, updateInstance } from '@/services/database';
import { ensureNotificationsPermissions, getLocalDateFromParts, scheduleAlarmNotification } from '@/services/notifications';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, usePathname } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DeviceEventEmitter, FlatList, Modal, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { Calendar } from 'react-native-calendars';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { TimelineView } from './timeline';

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  taskCard: { backgroundColor: AppTheme.surface, borderRadius: 12, padding: 14, marginVertical: 6, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: AppTheme.border },
  taskCardDone: { opacity: 0.6 },
  taskLeft: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  taskRight: { alignItems: 'flex-end' },
  taskName: { fontSize: 16, color: AppTheme.text },
  taskNameDone: { textDecorationLine: 'line-through', color: AppTheme.textMuted },
  taskNameStrikethrough: { textDecorationLine: 'line-through' },
  taskMeta: { fontSize: 12, color: AppTheme.textSecondary },
  pointsPending: { color: AppTheme.text },
  pointsEarned: { color: AppTheme.accentGreen },
  pointsFailed: { color: AppTheme.accentRed },
  pointsZero: { color: AppTheme.textSecondary },
  taskStatus: { fontSize: 13 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  headerLabel: { fontSize: 24, color: AppTheme.text, fontWeight: '700' },
  headerDate: { fontSize: 15, color: AppTheme.textSecondary },
  pointsBadge: { backgroundColor: AppTheme.surfaceElevated, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: AppTheme.border },
  pointsNumber: { fontSize: 14, color: AppTheme.text, fontWeight: '700' },
  pointsLabel: { fontSize: 11, color: AppTheme.textSecondary },
  dayOffsetBadge: { backgroundColor: AppTheme.surfaceElevated, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: AppTheme.border },
  dayOffsetText: { fontSize: 16, color: AppTheme.text, fontWeight: '700' },
  calendarToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 4 },
  calendarLabel: { fontSize: 15, color: AppTheme.textSecondary },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  calendarContainer: { backgroundColor: AppTheme.surface, borderRadius: 16, overflow: 'hidden', paddingBottom: 10 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 18, color: AppTheme.text, marginTop: 8, fontWeight: '600' },
  emptySubText: { fontSize: 14, color: AppTheme.textSecondary },
  strikethrough: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.06)' },
  recoveryContainer: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: AppTheme.border },
  recoveryHint: { fontSize: 12, color: AppTheme.accentAmber, marginBottom: 8 },
  recoveryActions: { flexDirection: 'row', gap: 8 },
  recoveryBtn: { flex: 1, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1 },
  recoveryBtnGreen: { borderColor: AppTheme.accentGreen, backgroundColor: 'rgba(124, 176, 131, 0.15)' },
  recoveryBtnOrange: { borderColor: AppTheme.accentOrange, backgroundColor: 'rgba(196, 134, 90, 0.15)' },
  recoveryBtnSmall: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: AppTheme.accent, backgroundColor: 'rgba(124, 176, 131, 0.15)' },
  recoveryBtnText: { fontSize: 11, fontWeight: '700', color: AppTheme.text, letterSpacing: 1 },
  recoveryCancelBtn: { paddingVertical: 8, paddingHorizontal: 12 },
  recoveryCancelText: { fontSize: 14, color: AppTheme.textMuted },
  rescheduleInline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rescheduleInput: { flex: 1, backgroundColor: AppTheme.background, borderRadius: 8, padding: 8, fontSize: 14, color: AppTheme.text, borderWidth: 1, borderColor: AppTheme.border },
  badge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, marginLeft: 8 },
  badgeEmergency: { backgroundColor: AppTheme.accentRed },
  badgeEmergencyText: { fontSize: 10, fontWeight: '700', color: AppTheme.text },
  badgeComplete: { backgroundColor: AppTheme.accentGreen },
  badgeSkipped: { backgroundColor: AppTheme.accentRed },
  badgeText: { fontSize: 10, fontWeight: '700', color: AppTheme.text },
});

type TaskInstance = {
  id: string;
  parentTaskId: string;
  name: string;
  date: string;
  scheduledTime: string;
  duration: number;
  status: string;
  recurrence: string;
  points: number;
  penaltyPoints: number;
  pointsEarned: number;
  startTime?: string | null;
  notifPhase1Id?: string | null;
  notifPhase2Id?: string | null;
};

const UNRESPONSIVE_STATUSES = new Set(['UNRESPONSIVE_START', 'UNRESPONSIVE_COMPLETION']);

const DONE_STATUSES = new Set([
  'COMPLETED', 'COMPLETED_EARLY', 'SKIPPED', 'FAILED',
  'UNRESPONSIVE_START', 'UNRESPONSIVE_COMPLETION', 'EMERGENCY_FROZEN'
]);

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: AppTheme.textMuted,
  STARTED: AppTheme.accentAmber,
  RESCHEDULED: AppTheme.accentAmber,
  COMPLETED: AppTheme.accentGreen,
  COMPLETED_EARLY: AppTheme.accentGreen,
  SKIPPED: AppTheme.accentRed,
  FAILED: AppTheme.accentRed,
  UNRESPONSIVE_START: AppTheme.accentRed,
  UNRESPONSIVE_COMPLETION: AppTheme.accentRed,
  EMERGENCY_FROZEN: AppTheme.accentRed,
};

const RECURRENCE_ICONS: Record<string, string> = {
  once: '1×', daily: '∞', weekly: 'W', custom_days: 'N',
};

export default function TodayScreen() {
  const [selectedDate, setSelectedDate] = useState(getLocalDateStr());
  const [showCalendar, setShowCalendar] = useState(false);
  const [tasks, setTasks] = useState<TaskInstance[]>([]);
  const [totalPoints, setTotalPoints] = useState(0);
  const [rescheduleTaskId, setRescheduleTaskId] = useState<string | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [rescheduleMinutes, setRescheduleMinutes] = useState('');
  const [isEmergencyActive, setIsEmergencyActive] = useState(false);
  const triggeredRef = useRef<Set<string>>(new Set());
  const notifSyncRef = useRef<Set<string>>(new Set());
  const pathname = usePathname();
  const navigation = useNavigation();

  const [isTimelineView, setIsTimelineView] = useState(false);
  const flipAnim = useSharedValue(0);

  const toggleView = () => {
    setIsTimelineView(!isTimelineView);
    flipAnim.value = withSpring(isTimelineView ? 0 : 180, { damping: 20, stiffness: 100 });
  };

  const frontAnimatedStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipAnim.value, [0, 180], [0, 180]);
    return {
      flex: 1,
      backfaceVisibility: 'hidden',
      transform: [{ perspective: 1000 }, { rotateY: `${rotateY}deg` }],
    };
  });

  const backAnimatedStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipAnim.value, [0, 180], [180, 360]);
    return {
      flex: 1,
      backfaceVisibility: 'hidden',
      position: 'absolute',
      width: '100%',
      height: '100%',
      transform: [{ perspective: 1000 }, { rotateY: `${rotateY}deg` }],
    };
  });

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      setSelectedDate(getLocalDateStr());
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    initDatabase()
      .then(() => generateTodayInstances(selectedDate))
      .catch(() => { });
  }, [selectedDate]);

  useEffect(() => {
    checkEmergencyMode().then(setIsEmergencyActive);
    const sub = DeviceEventEmitter.addListener(EMERGENCY_EVENT, setIsEmergencyActive);
    return () => sub.remove();
  }, []);

  const refreshTasks = useCallback(async () => {
    await generateTodayInstances(selectedDate);
    const instances = await getTodayInstances(selectedDate);

    // Sort order: active tasks first (by time), then crossed-off tasks in this order:
    //   1. Unresponsive (auto-skipped)
    //   2. Failed / Skipped
    //   3. Completed / Completed Early
    const statusRank = (status: string): number => {
      if (status === 'STARTED') return 0;
      if (status === 'SCHEDULED') return 1;
      if (status === 'RESCHEDULED') return 2;
      if (status === 'UNRESPONSIVE_START' || status === 'UNRESPONSIVE_COMPLETION') return 3;
      if (status === 'FAILED' || status === 'SKIPPED') return 4;
      if (status === 'COMPLETED' || status === 'COMPLETED_EARLY') return 5;
      if (status === 'EMERGENCY_FROZEN') return 6; // Emergency frozen tasks last
      return 2; // fallback for any unknown active status
    };
    instances.sort((a: TaskInstance, b: TaskInstance) => {
      const ra = statusRank(a.status);
      const rb = statusRank(b.status);
      if (ra !== rb) return ra - rb;
      // Within the same group, keep time ordering
      return a.scheduledTime.localeCompare(b.scheduledTime);
    });

    setTasks(instances);
    setTotalPoints(await getTodayPointsEarned(selectedDate));
  }, [selectedDate]);

  useFocusEffect(
    useCallback(() => {
      refreshTasks();
    }, [refreshTasks])
  );

  // ── Action handlers ──

  const handleCompleteEarly = async (instanceId: string) => {
    await completeInstance(instanceId, true);
    await refreshTasks();
  };

  const handleMarkDone = async (instanceId: string) => {
    await markInstanceDone(instanceId);
    setExpandedTaskId(null);
    await refreshTasks();
  };

  const handleSkip = async (instanceId: string) => {
    await skipInstance(instanceId);
    setExpandedTaskId(null);
    await refreshTasks();
  };

  const handleReschedule = async (instanceId: string) => {
    if (!rescheduleMinutes) return;
    const now = new Date();
    now.setMinutes(now.getMinutes() + parseInt(rescheduleMinutes));
    const h = now.getHours().toString().padStart(2, '0');
    const m = now.getMinutes().toString().padStart(2, '0');
    const newTime = `${h}:${m} `;
    await rescheduleInstance(instanceId, newTime);
    clearAlarmLock(instanceId, 'phase1');
    clearAlarmLock(instanceId, 'phase2');
    notifSyncRef.current.delete(instanceId); // Allow notification sync to re-fire if needed
    triggeredRef.current.delete(instanceId); // Allow catch-up check to re-fire if needed
    setRescheduleTaskId(null);
    setRescheduleMinutes('');

    // Cancel old notification before creating new one
    const inst = await getInstanceById(instanceId);
    if (inst?.notifPhase1Id) {
      const { cancelNotificationById } = await import('@/services/notifications');
      await cancelNotificationById(inst.notifPhase1Id);
    }

    // Schedule notification for the rescheduled instance
    if (inst) {
      const todayStr = getLocalDateStr();
      const fireAt = getLocalDateFromParts(todayStr, newTime);
      if (fireAt && fireAt.getTime() > Date.now()) {
        const ok = await ensureNotificationsPermissions();
        if (ok) {
          const notifId = await scheduleAlarmNotification({
            taskId: instanceId,
            taskName: inst.name || inst.parentTaskId,
            durationMinutes: inst.duration,
            scheduledTime: newTime,
            phase: 'phase1',
            fireAt,
          });
          await updateInstance(instanceId, { notifPhase1Id: notifId });
        }
      }
    }

    await refreshTasks();
  };

  const handleCompleteEmergency = async (id: string, originalPoints: number) => {
    await updateInstance(id, {
      status: 'COMPLETED',
      pointsEarned: originalPoints,
      completionTime: new Date().toISOString()
    });
    refreshTasks();
  };

  // ── Notification scheduling for SCHEDULED instances ──

  useEffect(() => {
    if (!tasks.length) return;

    const syncNotifs = async () => {
      // Only schedule notifications if the selected viewing date is exactly today
      if (isEmergencyActive || selectedDate !== getLocalDateStr()) return;

      for (const task of tasks) {
        if (task.status !== 'SCHEDULED' || notifSyncRef.current.has(task.id)) continue;
        if (task.notifPhase1Id) {
          notifSyncRef.current.add(task.id);
          continue;
        }
        notifSyncRef.current.add(task.id);
        const todayStr = getLocalDateStr();
        const fireAt = getLocalDateFromParts(todayStr, task.scheduledTime);
        if (!fireAt || fireAt.getTime() <= Date.now()) continue;
        const ok = await ensureNotificationsPermissions();
        if (!ok) continue;
        const notifId = await scheduleAlarmNotification({
          taskId: task.id,
          taskName: task.name || task.parentTaskId,
          durationMinutes: task.duration,
          scheduledTime: task.scheduledTime,
          phase: 'phase1',
          fireAt,
        });
        await updateInstance(task.id, { notifPhase1Id: notifId });
      }
    };
    syncNotifs();
  }, [tasks, isEmergencyActive, selectedDate]);

  // ── Catch-up check for overdue tasks (runs on focus, not polling) ──
  // Only triggers if the instance had a notification scheduled (notifPhase1Id set).
  // This prevents auto-triggering for tasks created after their scheduled time.

  // ── Exact Foreground Alarm Tracker (Zero Delay Event Loop) ──
  // Replaces the 1000ms polling with an exact-millisecond dynamic hardware-backed timeout calculation.
  useEffect(() => {
    if (!tasks.length) return;

    let timeoutId: ReturnType<typeof setTimeout>;

    const evaluateAlarms = async () => {
      const nowMs = Date.now();
      const now = new Date(nowMs);
      const hh = now.getHours().toString().padStart(2, '0');
      const mm = now.getMinutes().toString().padStart(2, '0');

      // Some existing tasks might have trailing spaces in db, clean them for comparison
      const nowTime = `${hh}:${mm}`;

      let minDelay = Infinity;

      for (const task of tasks) {
        // --- PHASE 2 CHECK ---
        if (task.status === 'STARTED' && task.startTime && task.duration) {
          const endT = new Date(task.startTime).getTime() + task.duration * 60000;
          if (endT <= nowMs) {
            if (pathname === '/alarm') {
              minDelay = Math.min(minDelay, 1000);
              continue;
            }
            if (!task.notifPhase2Id) continue;

            triggerAlarm(task.id, 'phase2', {
              taskId: task.id,
              taskName: task.name || task.parentTaskId,
              duration: task.duration.toString(),
              scheduledTime: task.scheduledTime,
              phase: 'phase2',
            });
            return; // Trigger one at a time globally
          } else {
            const delay = endT - nowMs;
            if (delay > 0 && delay < minDelay) minDelay = delay;
          }
        }

        // --- PHASE 1 CHECK ---
        if (task.status !== 'SCHEDULED' && task.status !== 'RESCHEDULED') continue;

        const scheduled = task.scheduledTime.trim();

        if (scheduled <= nowTime) {
          if (isEmergencyActive) {
            // Task expired during active emergency. Freeze it permanently.
            await updateInstance(task.id, {
              status: 'EMERGENCY_FROZEN',
              points: 0,
              penaltyPoints: 0,
              pointsEarned: 0,
            });
            await cancelInstanceNotifications(task);
            refreshTasks();
            return;
          }

          if (pathname === '/alarm') {
            minDelay = Math.min(minDelay, 1000);
            continue;
          }

          // Only trigger if a notification was scheduled — means it was created before its time
          if (!task.notifPhase1Id) continue;

          triggerAlarm(task.id, 'phase1', {
            taskId: task.id,
            taskName: task.name || task.parentTaskId,
            duration: task.duration.toString(),
            scheduledTime: task.scheduledTime,
            phase: 'phase1',
          });
          return; // Trigger one at a time globally
        } else {
          // Calculate delay to exact millisecond of the scheduled minute
          const [h, m] = scheduled.split(':').map(Number);
          const schedDate = new Date(nowMs);
          schedDate.setHours(h, m, 0, 0); // 0s, 0ms
          const delay = schedDate.getTime() - nowMs;
          if (delay > 0 && delay < minDelay) minDelay = delay;
        }
      }

      if (minDelay !== Infinity) {
        // Clamp to a nominal minimum to prevent infinite microtask locks in case of tiny clock drifting
        const safeDelay = Math.max(minDelay, 50);
        timeoutId = setTimeout(evaluateAlarms, safeDelay);
      }
    };

    evaluateAlarms();

    return () => clearTimeout(timeoutId);
  }, [tasks, pathname, isEmergencyActive, refreshTasks]);

  // ── Helpers ──

  const formatTimeAMPM = (time24: string) => {
    if (!time24) return '';
    const [hStr, mStr] = time24.split(':');
    let h = parseInt(hStr);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${mStr} ${ampm} `;
  };

  // ── Render ──

  const renderTask = ({ item }: { item: TaskInstance }) => {
    const isDone = DONE_STATUSES.has(item.status);
    const isCompleted = item.status === 'COMPLETED' || item.status === 'COMPLETED_EARLY';
    const isFailed = ['SKIPPED', 'FAILED', 'UNRESPONSIVE_START', 'UNRESPONSIVE_COMPLETION'].includes(item.status);
    const isUnresponsive = UNRESPONSIVE_STATUSES.has(item.status);
    const isStarted = item.status === 'STARTED';
    const isEmergencyFrozen = item.status === 'EMERGENCY_FROZEN';
    const isUpcoming = item.status === 'SCHEDULED' || item.status === 'RESCHEDULED';
    const isExpanded = expandedTaskId === item.id;
    const isStartedNoDuration = isStarted && !item.duration;
    const isStartedWithDuration = isStarted && !!item.duration;
    const isRecoverable = isUnresponsive || item.status === 'SKIPPED' || item.status === 'FAILED';

    // Points display
    let pointsDisplay = <Text style={styles.pointsPending}>{item.points}pt</Text>;
    if (isEmergencyFrozen) {
      pointsDisplay = <Text style={[styles.pointsPending, { color: AppTheme.textMuted }]}>0pt</Text>;
    } else if (isDone) {
      if (item.pointsEarned > 0) {
        pointsDisplay = <Text style={styles.pointsEarned}>+{item.pointsEarned}</Text>;
      } else if (item.pointsEarned < 0) {
        pointsDisplay = <Text style={styles.pointsFailed}>{item.pointsEarned}</Text>;
      } else {
        pointsDisplay = <Text style={styles.pointsZero}>0</Text>;
      }
    }

    const nameStyle = [styles.taskName, isDone && styles.taskNameDone, isDone && !isUnresponsive && !isEmergencyFrozen && styles.taskNameStrikethrough];
    const statusColor = isDone ? AppTheme.textMuted : STATUS_COLORS[item.status] || AppTheme.textMuted;

    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => {
          if (isCompleted || isEmergencyFrozen) return; // Cannot expand finalized/frozen tasks
          setExpandedTaskId(isExpanded ? null : item.id);
        }}
        style={[styles.taskCard, isDone && !isUnresponsive && !isEmergencyFrozen && styles.taskCardDone, isExpanded && { borderColor: AppTheme.accent }]}
      >
        {isDone && !isUnresponsive && !isEmergencyFrozen && (
          <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
            <View style={styles.strikethrough} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <View style={styles.taskLeft}>
            <View style={[
              styles.statusDot,
              { backgroundColor: isUnresponsive || isEmergencyFrozen ? AppTheme.accentAmber : isDone ? AppTheme.border : STATUS_COLORS[item.status] || AppTheme.textMuted }
            ]} />
            <View style={{ flex: 1 }}>
              <Text style={nameStyle}>
                {item.name || item.parentTaskId}
              </Text>
              <Text style={styles.taskMeta}>
                {formatTimeAMPM(item.scheduledTime)} · {item.duration} min · {RECURRENCE_ICONS[item.recurrence] || '1×'}
              </Text>
            </View>
            <View style={styles.taskRight}>
              {pointsDisplay}
              <Text style={[styles.taskStatus, { color: isUnresponsive || isEmergencyFrozen ? AppTheme.accentAmber : statusColor }]}>
                {isEmergencyFrozen ? 'EMERGENCY FROZEN' : isUnresponsive ? 'AUTO-SKIPPED' : item.status.replace(/_/g, ' ')}
              </Text>
            </View>
          </View>

          {/* UPCOMING or STARTED (no duration) → Done / Skip */}
          {isExpanded && (isUpcoming || isStartedNoDuration) && (
            <View style={styles.recoveryContainer}>
              <View style={styles.recoveryActions}>
                <TouchableOpacity
                  style={[styles.recoveryBtn, styles.recoveryBtnGreen]}
                  onPress={() => item.status === 'STARTED' ? handleCompleteEarly(item.id) : handleMarkDone(item.id)}
                >
                  <Text style={styles.recoveryBtnText}>✓ DONE</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.recoveryBtn, styles.recoveryBtnOrange]}
                  onPress={() => handleSkip(item.id)}
                >
                  <Text style={styles.recoveryBtnText}>✕ SKIP</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* STARTED (with duration) → Done Early button */}
          {isStartedWithDuration && (
            <View style={styles.recoveryContainer}>
              <View style={styles.recoveryActions}>
                <TouchableOpacity
                  style={[styles.recoveryBtn, styles.recoveryBtnGreen]}
                  onPress={() => handleCompleteEarly(item.id)}
                >
                  <Text style={styles.recoveryBtnText}>✓ DONE EARLY</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* RECOVERABLE (Unresponsive, Skipped, Failed) → Recovery buttons */}
          {isExpanded && isRecoverable && (
            <View style={styles.recoveryContainer}>
              <Text style={styles.recoveryHint}>Missed this one? You can still recover it.</Text>
              {rescheduleTaskId === item.id ? (
                <View style={styles.rescheduleInline}>
                  <TextInput
                    style={styles.rescheduleInput}
                    placeholder="Minutes from now"
                    placeholderTextColor={AppTheme.textMuted}
                    keyboardType="number-pad"
                    value={rescheduleMinutes}
                    onChangeText={setRescheduleMinutes}
                    autoFocus
                  />
                  <TouchableOpacity
                    style={styles.recoveryBtnSmall}
                    onPress={() => handleReschedule(item.id)}
                  >
                    <Text style={styles.recoveryBtnText}>GO</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.recoveryCancelBtn}
                    onPress={() => { setRescheduleTaskId(null); setRescheduleMinutes(''); }}
                  >
                    <Text style={styles.recoveryCancelText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.recoveryActions}>
                  <TouchableOpacity
                    style={[styles.recoveryBtn, styles.recoveryBtnGreen]}
                    onPress={() => handleMarkDone(item.id)}
                  >
                    <Text style={styles.recoveryBtnText}>✓ MARK DONE</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.recoveryBtn, styles.recoveryBtnOrange]}
                    onPress={() => setRescheduleTaskId(item.id)}
                  >
                    <Text style={styles.recoveryBtnText}>↷ RESCHEDULE</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* EMERGENCY_FROZEN → Recovery button if emergency is over */}
          {isEmergencyFrozen && !isEmergencyActive && (
            <View style={styles.recoveryContainer}>
              <Text style={styles.recoveryHint}>Emergency over. You can complete this task for original points.</Text>
              <View style={styles.recoveryActions}>
                <TouchableOpacity
                  style={[styles.recoveryBtn, styles.recoveryBtnGreen]}
                  onPress={() => handleCompleteEmergency(item.id, item.points)}
                >
                  <Text style={styles.recoveryBtnText}>✓ COMPLETE ({item.points} PTS)</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <ScreenContainer>
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={AppTheme.background} />
        <View style={styles.header}>
          <View>
            {(() => {
              const todayStr = getLocalDateStr();
              if (selectedDate === todayStr) return <Text style={styles.headerLabel}>today</Text>;

              const selectedObj = new Date(selectedDate + 'T12:00:00Z');
              const todayObj = new Date(todayStr + 'T12:00:00Z');
              const diffDays = Math.round((selectedObj.getTime() - todayObj.getTime()) / (1000 * 60 * 60 * 24));

              if (diffDays === 1) return <Text style={styles.headerLabel}>Tomorrow</Text>;
              if (diffDays === -1) return <Text style={styles.headerLabel}>Yesterday</Text>;

              return (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={styles.headerLabel}>Day</Text>
                  <View style={styles.dayOffsetBadge}>
                    <Text style={styles.dayOffsetText}>{diffDays > 0 ? `+${diffDays}` : diffDays}</Text>
                  </View>
                </View>
              );
            })()}
            <TouchableOpacity style={styles.calendarToggle} onPress={() => setShowCalendar(true)}>
              <Ionicons name="calendar-outline" size={16} color={AppTheme.accent} />
              <Text style={styles.calendarLabel}>
                {new Date(selectedDate + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TouchableOpacity onPress={toggleView} style={{ padding: 4 }}>
              <Ionicons name="swap-horizontal-outline" size={28} color={AppTheme.accent} />
            </TouchableOpacity>
            <View style={styles.pointsBadge}>
              <Text style={styles.pointsNumber}>{totalPoints}</Text>
              <Text style={styles.pointsLabel}>pts</Text>
            </View>
          </View>
        </View>

        <View style={{ flex: 1, position: 'relative' }}>
          <Animated.View style={frontAnimatedStyle} pointerEvents={isTimelineView ? 'none' : 'auto'}>
            {tasks.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="sunny-outline" size={64} color={AppTheme.textMuted} />
                <Text style={styles.emptyText}>No tasks for this day.</Text>
                <Text style={styles.emptySubText}>Select another day or create a task.</Text>
              </View>
            ) : (
              <FlatList
                data={tasks}
                keyExtractor={(item) => item.id}
                renderItem={renderTask}
                contentContainerStyle={{ paddingBottom: 100 }}
              />
            )}
          </Animated.View>

          <Animated.View style={backAnimatedStyle} pointerEvents={isTimelineView ? 'auto' : 'none'}>
            <TimelineView tasks={tasks} />
          </Animated.View>
        </View>
      </View>

      <Modal visible={showCalendar} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setShowCalendar(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.calendarContainer}>
                <Calendar
                  current={selectedDate}
                  onDayPress={(day: any) => {
                    setSelectedDate(day.dateString);
                    setShowCalendar(false);
                  }}
                  theme={{
                    calendarBackground: AppTheme.surface,
                    textSectionTitleColor: AppTheme.textSecondary,
                    selectedDayBackgroundColor: AppTheme.accent,
                    selectedDayTextColor: '#000',
                    todayTextColor: AppTheme.accent,
                    dayTextColor: AppTheme.text,
                    textDisabledColor: AppTheme.border,
                    monthTextColor: AppTheme.text,
                    arrowColor: AppTheme.accent,
                  }}
                  markedDates={{
                    [selectedDate]: { selected: true, selectedColor: AppTheme.accent },
                    [getLocalDateStr()]: { marked: true, dotColor: AppTheme.accentGreen }
                  }}
                />
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </ScreenContainer>
  );
}
