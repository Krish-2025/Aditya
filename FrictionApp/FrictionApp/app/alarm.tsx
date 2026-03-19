import { PHASE1_NO_RESPONSE_SECONDS, PHASE2_NO_RESPONSE_SECONDS } from '@/config/reminders';
import { AppTheme } from '@/constants/theme';
import { clearAlarmLock } from '@/services/alarmManager';
import { autoSkipInstance, completeInstance, extendInstance, failInstance, getInstanceById, getLocalDateStr, logTaskEvent, rescheduleInstance, skipInstance, updateInstance } from '@/services/database';
import { cancelNotificationById, ensureNotificationsPermissions, scheduleAlarmNotification } from '@/services/notifications';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { BackHandler, StyleSheet, Text, TextInput, TouchableOpacity, Vibration, View } from 'react-native';

type Phase = 'phase1' | 'phase2';

export default function AlarmScreen() {
  // taskId is now the INSTANCE ID (e.g., "Morning workout::2026-02-28")
  const { taskId, taskName, duration, phase: initialPhase } = useLocalSearchParams<{
    taskId: string;
    taskName: string;
    duration: string;
    phase: string;
  }>();

  const [phase] = useState<Phase>((initialPhase as Phase) || 'phase1');
  const [autoSkipSeconds, setAutoSkipSeconds] = useState(
    phase === 'phase1' ? PHASE1_NO_RESPONSE_SECONDS : PHASE2_NO_RESPONSE_SECONDS
  );
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleMinutes, setRescheduleMinutes] = useState('');
  const [rescheduleHours, setRescheduleHours] = useState('');
  const [rescheduleMin, setRescheduleMin] = useState('');
  const [amPm, setAmPm] = useState<'AM' | 'PM'>('AM');
  const [extendMinutes, setExtendMinutes] = useState('');
  const [showExtend, setShowExtend] = useState(false);
  const [showSkipReason, setShowSkipReason] = useState(false);
  const [skipReason, setSkipReason] = useState('');

  const startTimestamp = useRef(Date.now());
  const autoSkipRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasActedRef = useRef(false);

  useEffect(() => {
    const backSub = BackHandler.addEventListener('hardwareBackPress', () => true);
    activateKeepAwakeAsync();
    Vibration.vibrate([0, 1000, 100, 1000, 100, 1000, 100, 1000], true);

    autoSkipRef.current = setInterval(() => {
      setAutoSkipSeconds(prev => {
        if (prev <= 1) {
          if (!hasActedRef.current) {
            hasActedRef.current = true;
            stopAlarm();
            const latency = Math.floor((Date.now() - startTimestamp.current) / 1000);
            (async () => {
              const inst = await getInstanceById(taskId);
              if (inst) {
                const phaseKey = phase === 'phase1' ? 'notifPhase1Id' : 'notifPhase2Id';
                await cancelNotificationById(inst[phaseKey]);
                await updateInstance(taskId, { [phaseKey]: null });
              }
              await autoSkipInstance(taskId, phase, latency);
              setTimeout(() => router.back(), 50);
            })().catch(() => { });
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      backSub.remove();
      stopAlarm();
    };
  }, []);

  const stopAlarm = () => {
    Vibration.cancel();
    deactivateKeepAwake();
    if (autoSkipRef.current) {
      clearInterval(autoSkipRef.current);
      autoSkipRef.current = null;
    }
  };

  const latencySeconds = () => Math.floor((Date.now() - startTimestamp.current) / 1000);

  const clearAndCancelNotif = async (phaseKey: 'notifPhase1Id' | 'notifPhase2Id') => {
    const inst = await getInstanceById(taskId);
    if (!inst) return;
    const id = inst?.[phaseKey] as string | null | undefined;
    await cancelNotificationById(id);
    await updateInstance(taskId, { [phaseKey]: null });
  };

  const schedulePhase2Notification = async () => {
    const inst = await getInstanceById(taskId);
    if (!inst?.startTime) return;
    const start = new Date(inst.startTime);
    const fireAt = new Date(start.getTime() + (inst.duration || 0) * 60_000);
    if (fireAt.getTime() <= Date.now()) return;
    const ok = await ensureNotificationsPermissions();
    if (!ok) return;
    const id = await scheduleAlarmNotification({
      taskId,
      taskName: String(taskName || inst.name || ''),
      durationMinutes: Number(inst.duration || duration || 0),
      scheduledTime: String(inst.scheduledTime || ''),
      phase: 'phase2',
      fireAt,
    });
    await updateInstance(taskId, { notifPhase2Id: id });
  };

  const schedulePhase1NotificationForNewTime = async (newTime24: string) => {
    const inst = await getInstanceById(taskId);
    const dateStr = String(inst?.date || getLocalDateStr());
    const [y, m, d] = dateStr.split('-').map(Number);
    const [hh, mm] = newTime24.split(':').map(Number);
    const fireAt = new Date(y, m - 1, d, hh, mm, 0, 0);
    if (fireAt.getTime() <= Date.now()) return;
    const ok = await ensureNotificationsPermissions();
    if (!ok) return;
    const id = await scheduleAlarmNotification({
      taskId,
      taskName: String(taskName || inst?.name || ''),
      durationMinutes: Number(inst?.duration || duration || 0),
      scheduledTime: newTime24,
      phase: 'phase1',
      fireAt,
    });
    await updateInstance(taskId, { notifPhase1Id: id });
  };

  const act = (fn: () => void | Promise<void>) => {
    if (hasActedRef.current) return;
    hasActedRef.current = true;
    stopAlarm();
    Promise.resolve(fn()).finally(() => {
      setTimeout(() => router.back(), 50);
    });
  };

  // ── Phase 1 handlers ──

  const handleStartTask = () => act(async () => {
    const latency = latencySeconds();
    await clearAndCancelNotif('notifPhase1Id');
    await updateInstance(taskId, {
      status: 'STARTED',
      startTime: new Date().toISOString(),
      responseLatency: latency,
      responseLatencyStart: latency,
    });
    await logTaskEvent(String(taskName || ''), 'STARTED', { instanceId: taskId, latency });
    await schedulePhase2Notification();
  });

  const handleStartTaskNoDuration = () => act(async () => {
    const latency = latencySeconds();
    await clearAndCancelNotif('notifPhase1Id');
    await updateInstance(taskId, {
      status: 'STARTED',
      startTime: new Date().toISOString(),
      responseLatency: latency,
      responseLatencyStart: latency,
    });
    await logTaskEvent(String(taskName || ''), 'STARTED', { instanceId: taskId, latency });
  });

  const handleCompletedEarly = () => act(async () => {
    const latency = latencySeconds();
    await clearAndCancelNotif('notifPhase1Id');
    await updateInstance(taskId, {
      responseLatency: latency,
      responseLatencyStart: latency,
    });
    await completeInstance(taskId, true);
  });

  const handleSkipPhase1 = () => act(async () => {
    const latency = latencySeconds();
    await clearAndCancelNotif('notifPhase1Id');
    await updateInstance(taskId, {
      responseLatency: latency,
      responseLatencyStart: latency,
    });
    await skipInstance(taskId, skipReason || undefined);
  });

  // ── Reschedule handlers (both phases) ──

  const handleRescheduleDelay = () => {
    if (!rescheduleMinutes) return;
    act(async () => {
      const latency = latencySeconds();
      const newTime = new Date();
      newTime.setMinutes(newTime.getMinutes() + parseInt(rescheduleMinutes));
      const h = newTime.getHours().toString().padStart(2, '0');
      const m = newTime.getMinutes().toString().padStart(2, '0');
      await clearAndCancelNotif(phase === 'phase2' ? 'notifPhase2Id' : 'notifPhase1Id');
      await updateInstance(taskId, {
        responseLatency: latency,
        ...(phase === 'phase1' ? { responseLatencyStart: latency } : { responseLatencyCompletion: latency }),
      });
      await rescheduleInstance(taskId, `${h}:${m}`);
      await schedulePhase1NotificationForNewTime(`${h}:${m}`);
      clearAlarmLock(taskId, 'phase1');
      clearAlarmLock(taskId, 'phase2');
    });
  };

  const handleRescheduleManual = () => {
    if (!rescheduleHours || !rescheduleMin) return;
    act(async () => {
      const latency = latencySeconds();
      let h = parseInt(rescheduleHours);
      if (amPm === 'PM' && h < 12) h += 12;
      if (amPm === 'AM' && h === 12) h = 0;
      const newScheduled = `${h.toString().padStart(2, '0')}:${rescheduleMin.padStart(2, '0')}`;
      await clearAndCancelNotif(phase === 'phase2' ? 'notifPhase2Id' : 'notifPhase1Id');
      await updateInstance(taskId, {
        responseLatency: latency,
        ...(phase === 'phase1' ? { responseLatencyStart: latency } : { responseLatencyCompletion: latency }),
      });
      await rescheduleInstance(taskId, newScheduled);
      await schedulePhase1NotificationForNewTime(newScheduled);
      clearAlarmLock(taskId, 'phase1');
      clearAlarmLock(taskId, 'phase2');
    });
  };

  // ── Phase 2 handlers ──

  const handleCompleted = () => act(async () => {
    const latency = latencySeconds();
    await clearAndCancelNotif('notifPhase2Id');
    await updateInstance(taskId, {
      responseLatency: latency,
      responseLatencyCompletion: latency,
    });
    await completeInstance(taskId, false);
  });

  const handleExtend = () => {
    if (!extendMinutes || hasActedRef.current) return;
    hasActedRef.current = true;
    stopAlarm();
    (async () => {
      const latency = latencySeconds();
      await clearAndCancelNotif('notifPhase2Id');
      await updateInstance(taskId, { responseLatency: latency, responseLatencyCompletion: latency });
      await extendInstance(taskId, parseInt(extendMinutes));
      await schedulePhase2Notification();
      clearAlarmLock(taskId, 'phase2');
      setTimeout(() => router.back(), 50);
    })();
  };

  const handleFailed = () => act(async () => {
    const latency = latencySeconds();
    await clearAndCancelNotif('notifPhase2Id');
    await updateInstance(taskId, {
      responseLatency: latency,
      responseLatencyCompletion: latency,
    });
    await failInstance(taskId);
  });

  // ── Rendering ──

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (showReschedule) {
    return (
      <View style={styles.container}>
        <Text style={styles.phaseLabel}>RESCHEDULE</Text>
        <Text style={styles.taskName}>{taskName}</Text>

        <Text style={styles.sectionLabel}>DELAY BY MINUTES</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 30"
          placeholderTextColor={AppTheme.textMuted}
          keyboardType="number-pad"
          value={rescheduleMinutes}
          onChangeText={setRescheduleMinutes}
        />
        <TouchableOpacity style={[styles.btn, styles.neonBtn]} onPress={handleRescheduleDelay}>
          <Text style={styles.neonBtnText}>DELAY BY {rescheduleMinutes || '?'} MINUTES</Text>
        </TouchableOpacity>

        <Text style={[styles.sectionLabel, { marginTop: 32 }]}>SET NEW TIME</Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.timeInput]}
            placeholder="HH"
            placeholderTextColor={AppTheme.textMuted}
            keyboardType="number-pad"
            maxLength={2}
            value={rescheduleHours}
            onChangeText={setRescheduleHours}
          />
          <Text style={styles.colon}>:</Text>
          <TextInput
            style={[styles.input, styles.timeInput]}
            placeholder="MM"
            placeholderTextColor={AppTheme.textMuted}
            keyboardType="number-pad"
            maxLength={2}
            value={rescheduleMin}
            onChangeText={setRescheduleMin}
          />
          <View style={styles.amPmContainer}>
            <TouchableOpacity
              style={[styles.amPmBtn, amPm === 'AM' && styles.amPmBtnActive]}
              onPress={() => setAmPm('AM')}
            >
              <Text style={[styles.amPmText, amPm === 'AM' && styles.amPmTextActive]}>AM</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.amPmBtn, amPm === 'PM' && styles.amPmBtnActive]}
              onPress={() => setAmPm('PM')}
            >
              <Text style={[styles.amPmText, amPm === 'PM' && styles.amPmTextActive]}>PM</Text>
            </TouchableOpacity>
          </View>
        </View>
        <TouchableOpacity style={[styles.btn, styles.neonBtn]} onPress={handleRescheduleManual}>
          <Text style={styles.neonBtnText}>SET TO {rescheduleHours || 'HH'}:{rescheduleMin || 'MM'} {amPm}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowReschedule(false)}>
          <Text style={styles.cancelText}>CANCEL</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (phase === 'phase1') {
    return (
      <View style={styles.container}>
        <Text style={styles.phaseLabel}>TASK REMINDER</Text>
        <Text style={styles.taskName}>{taskName}</Text>
        <Text style={styles.meta}>Estimated duration: {duration} min</Text>

        <View style={styles.timerContainer}>
          <Text style={styles.timerLabel}>AUTO-SKIP IN</Text>
          <Text style={styles.timer}>{formatTime(autoSkipSeconds)}</Text>
        </View>

        {showSkipReason ? (
          <View style={styles.extendContainer}>
            <Text style={styles.sectionLabel}>WHY SKIP TODAY? (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Too tired, unexpected meeting"
              placeholderTextColor={AppTheme.textMuted}
              value={skipReason}
              onChangeText={setSkipReason}
              autoFocus
            />
            <TouchableOpacity style={[styles.btn, styles.redBtn]} onPress={handleSkipPhase1}>
              <Text style={styles.btnText}>✕ CONFIRM SKIP</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowSkipReason(false)}>
              <Text style={styles.cancelText}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.buttons}>
            {duration && duration !== '0' && duration !== 'null' ? (
              <>
                <TouchableOpacity style={[styles.btn, styles.neonBtn]} onPress={handleStartTask}>
                  <Text style={styles.neonBtnText}>▶ START TASK</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, styles.greenBtn]} onPress={handleCompletedEarly}>
                  <Text style={styles.btnText}>✓ ALREADY DONE</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, styles.orangeBtn]} onPress={() => setShowReschedule(true)}>
                  <Text style={styles.btnText}>↷ RESCHEDULE</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, styles.redBtn]} onPress={() => setShowSkipReason(true)}>
                  <Text style={styles.btnText}>✕ SKIP TODAY</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity style={[styles.btn, styles.neonBtn]} onPress={handleStartTaskNoDuration}>
                  <Text style={styles.neonBtnText}>ON-IT</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, styles.greenBtn]} onPress={handleCompletedEarly}>
                  <Text style={styles.btnText}>✓ DONE</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, styles.redBtn]} onPress={() => setShowSkipReason(true)}>
                  <Text style={styles.btnText}>✕ SKIP</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.phaseLabel}>{"TIME'S UP — HOW DID IT GO?"}</Text>
      <Text style={styles.taskName}>{taskName}</Text>
      <Text style={styles.meta}>Duration was: {duration} min</Text>

      <View style={styles.timerContainer}>
        <Text style={styles.timerLabel}>AUTO-SKIP IN</Text>
        <Text style={styles.timer}>{formatTime(autoSkipSeconds)}</Text>
      </View>

      {showExtend ? (
        <View style={styles.extendContainer}>
          <Text style={styles.sectionLabel}>NEED MORE TIME? (minutes)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 15"
            placeholderTextColor={AppTheme.textMuted}
            keyboardType="number-pad"
            value={extendMinutes}
            onChangeText={setExtendMinutes}
          />
          <TouchableOpacity style={[styles.btn, styles.neonBtn]} onPress={handleExtend}>
            <Text style={styles.neonBtnText}>EXTEND {extendMinutes || '?'} MINUTES</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowExtend(false)}>
            <Text style={styles.cancelText}>CANCEL</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.buttons}>
          <TouchableOpacity style={[styles.btn, styles.greenBtn]} onPress={handleCompleted}>
            <Text style={styles.btnText}>✓ COMPLETED</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.neonBtn]} onPress={() => setShowExtend(true)}>
            <Text style={styles.neonBtnText}>+ NEED MORE TIME</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.orangeBtn]} onPress={() => setShowReschedule(true)}>
            <Text style={styles.btnText}>↷ RESCHEDULE REST</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.redBtn]} onPress={handleFailed}>
            <Text style={styles.btnText}>{"✕ DIDN'T COMPLETE"}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AppTheme.background, justifyContent: 'center', alignItems: 'center', padding: 28 },
  phaseLabel: { fontSize: 11, color: AppTheme.accent, fontWeight: '700', letterSpacing: 3, marginBottom: 12, textShadowColor: AppTheme.accent, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8 },
  taskName: { fontSize: 26, color: AppTheme.text, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  meta: { fontSize: 14, color: AppTheme.textSecondary, marginBottom: 32 },
  timerContainer: { alignItems: 'center', marginBottom: 48 },
  timerLabel: { fontSize: 11, color: AppTheme.textMuted, letterSpacing: 3, marginBottom: 8 },
  timer: { fontSize: 72, color: AppTheme.accent, fontWeight: '200' },
  buttons: { width: '100%', gap: 12 },
  btn: { padding: 18, borderRadius: 14, alignItems: 'center' },
  neonBtn: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: AppTheme.accent },
  neonBtnText: { color: AppTheme.accent, fontSize: 15, fontWeight: '700', letterSpacing: 2 },
  greenBtn: { backgroundColor: 'rgba(124, 176, 131, 0.2)', borderWidth: 1, borderColor: AppTheme.accentGreen },
  orangeBtn: { backgroundColor: 'rgba(196, 134, 90, 0.2)', borderWidth: 1, borderColor: AppTheme.accentOrange },
  redBtn: { backgroundColor: 'rgba(184, 122, 122, 0.2)', borderWidth: 1, borderColor: AppTheme.accentRed },
  btnText: { color: AppTheme.text, fontSize: 15, fontWeight: '700', letterSpacing: 1 },
  sectionLabel: { fontSize: 11, color: AppTheme.accent, fontWeight: '700', letterSpacing: 2, marginBottom: 12, alignSelf: 'flex-start' },
  input: { backgroundColor: AppTheme.surface, borderRadius: 12, padding: 16, fontSize: 16, color: AppTheme.text, borderWidth: 1, borderColor: AppTheme.border, width: '100%', marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  timeInput: { width: 80, textAlign: 'center' },
  colon: { fontSize: 24, fontWeight: 'bold', marginHorizontal: 12, color: AppTheme.text },
  amPmContainer: { flexDirection: 'row', marginLeft: 16, backgroundColor: AppTheme.surface, borderRadius: 12, borderWidth: 1, borderColor: AppTheme.border, overflow: 'hidden' },
  amPmBtn: { paddingHorizontal: 16, paddingVertical: 12 },
  amPmBtnActive: { backgroundColor: AppTheme.surfaceElevated },
  amPmText: { color: AppTheme.textMuted, fontSize: 14, fontWeight: '700' },
  amPmTextActive: { color: AppTheme.accent },
  extendContainer: { width: '100%', alignItems: 'center' },
  cancelBtn: { marginTop: 16, padding: 12 },
  cancelText: { color: AppTheme.textSecondary, fontSize: 13, letterSpacing: 2 },
});