import { generateTodayInstances, getInstanceById, getLocalDateStr, updateInstance, updateTaskFull } from '@/services/database';
import { cancelNotificationById, ensureNotificationsPermissions, getLocalDateFromParts, scheduleAlarmNotification } from '@/services/notifications';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInDown, FadeOut, FadeOutDown } from 'react-native-reanimated';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SOUNDS = ['default', 'alert', 'chime', 'bell', 'digital', 'none'];
type Recurrence = 'daily' | 'weekly' | 'custom_days';

export default function EditTaskScreen() {
  const params = useLocalSearchParams<{
    id: string; name: string; description: string; scheduledTime: string;
    duration: string; points: string; penaltyPoints: string;
    recurrence: string; recurrenceValue: string;
    recurrenceDays: string; soundName: string;
    startDate: string; endDate: string;
  }>();

  const [taskName, setTaskName] = useState(params.name || '');
  const initialHour = params.scheduledTime ? parseInt(params.scheduledTime.split(':')[0]) : 12;
  const isPM = initialHour >= 12;
  const displayHour = initialHour % 12 || 12;

  const [hours, setHours] = useState(displayHour.toString());
  const [minutes, setMinutes] = useState(params.scheduledTime?.split(':')[1] || '00');
  const [amPm, setAmPm] = useState<'AM' | 'PM'>(isPM ? 'PM' : 'AM');
  const [description, setDescription] = useState(params.description || '');
  const [duration, setDuration] = useState(params.duration || '');
  const [points, setPoints] = useState(params.points || '10');
  const [penaltyPoints, setPenaltyPoints] = useState(params.penaltyPoints || '');

  // Convert legacy 'once' to 'daily' for the UI if necessary
  const initRecurrence = (params.recurrence === 'once' ? 'daily' : params.recurrence) as Recurrence;
  const [recurrence, setRecurrence] = useState<Recurrence>(initRecurrence || 'daily');

  const [customDays, setCustomDays] = useState<number[]>(
    params.recurrenceDays ? params.recurrenceDays.split(',').filter(Boolean).map(Number) : []
  );
  const [repeatEvery, setRepeatEvery] = useState(params.recurrenceValue || '');
  const [sound, setSound] = useState(params.soundName || 'default');
  const [startDate, setStartDate] = useState(params.startDate || '');
  const [endDate, setEndDate] = useState(params.endDate || '');

  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Format YYYY-MM-DD as user types
  const formatDateInput = (text: string) => {
    const digits = text.replace(/\D/g, '');
    let res = '';
    if (digits.length > 0) {
      res += digits.substring(0, 4);
    }
    if (digits.length >= 5) {
      res += '-' + digits.substring(4, 6);
    }
    if (digits.length >= 7) {
      res += '-' + digits.substring(6, 8);
    }
    return res;
  };

  const toggleDay = (day: number) => {
    setCustomDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const getValidationState = (name: string, value: string) => {
    if (!value) return 'none';
    if (name === 'hours') {
      const h = parseInt(value);
      return (h >= 1 && h <= 12) ? 'success' : 'error';
    }
    if (name === 'minutes') {
      const m = parseInt(value);
      return (value.length === 2 && m >= 0 && m <= 59) ? 'success' : 'error';
    }
    if (name === 'points' || name === 'penalty' || name === 'duration') {
      return isNaN(parseInt(value)) ? 'error' : 'success';
    }
    return 'success';
  };

  const hoursVal = getValidationState('hours', hours);
  const minsVal = getValidationState('minutes', minutes);

  const handleSave = async () => {
    if (!hours || !minutes) {
      Alert.alert('Missing Fields', 'Please fill out Scheduled Time.');
      return;
    }
    if (hoursVal === 'error' || minsVal === 'error') {
      Alert.alert('Invalid Time', 'Please enter a valid HH:MM time.');
      return;
    }

    setIsSubmitting(true);
    let h = parseInt(hours);
    if (amPm === 'PM' && h < 12) h += 12;
    if (amPm === 'AM' && h === 12) h = 0;
    const scheduledTime = `${h.toString().padStart(2, '0')}:${minutes.padStart(2, '0')}`;

    try {
      await updateTaskFull({
        id: params.id,
        description,
        scheduledTime,
        duration: duration ? parseInt(duration) : undefined,
        points: parseInt(points) || 10,
        penaltyPoints: parseInt(penaltyPoints) || 0,
        recurrence,
        recurrenceValue: recurrence === 'custom_days' ? parseInt(repeatEvery) || 1 : 1,
        recurrenceDays: recurrence === 'weekly' ? customDays.join(',') : '',
        soundName: sound,
      });

      await generateTodayInstances();

      const todayStr = getLocalDateStr();
      const instId = `${params.id}::${todayStr}`;
      const inst = await getInstanceById(instId);
      if (inst) {
        await updateInstance(instId, {
          scheduledTime,
          duration: duration ? parseInt(duration) : undefined,
          points: parseInt(points) || 10,
          penaltyPoints: parseInt(penaltyPoints) || 0,
          soundName: sound,
        });

        if (inst.notifPhase1Id) await cancelNotificationById(inst.notifPhase1Id);
        if (inst.notifPhase2Id) await cancelNotificationById(inst.notifPhase2Id);
        await updateInstance(instId, { notifPhase1Id: null, notifPhase2Id: null });

        if (inst.status === 'SCHEDULED') {
          const ok = await ensureNotificationsPermissions();
          if (ok) {
            const fireAt = getLocalDateFromParts(todayStr, scheduledTime);
            if (fireAt && fireAt.getTime() > Date.now()) {
              const notifId = await scheduleAlarmNotification({
                taskId: instId,
                taskName: params.name,
                durationMinutes: duration ? parseInt(duration) : 0,
                scheduledTime,
                phase: 'phase1',
                fireAt,
              });
              await updateInstance(instId, { notifPhase1Id: notifId });
            }
          }
        } else if (inst.status === 'STARTED' && inst.startTime) {
          const ok = await ensureNotificationsPermissions();
          if (ok) {
            const start = new Date(inst.startTime);
            const durationMins = duration ? parseInt(duration) : 0;
            const fireAt = new Date(start.getTime() + durationMins * 60_000);
            if (fireAt.getTime() > Date.now()) {
              const notifId = await scheduleAlarmNotification({
                taskId: instId,
                taskName: params.name,
                durationMinutes: durationMins,
                scheduledTime: inst.scheduledTime,
                phase: 'phase2',
                fireAt,
              });
              await updateInstance(instId, { notifPhase2Id: notifId });
            }
          }
        }
      }
      setTimeout(() => router.back(), 150);
    } catch (e) {
      console.error('Failed to save task', e);
      Alert.alert('Error', 'Failed to save changes.');
      setIsSubmitting(false);
    }
  };

  const getInputStyle = (name: string, valState: 'none' | 'success' | 'error' = 'none') => {
    let focusStyle = {};
    if (focusedInput === name) {
      if (name === 'points') focusStyle = styles.inputFocusedGreen;
      else if (name === 'penalty') focusStyle = styles.inputFocusedRed;
      else focusStyle = styles.inputFocused;
    } else if (valState === 'error') {
      focusStyle = styles.inputError;
    } else if (valState === 'success' && name === 'name') {
      focusStyle = styles.inputSuccess;
    }
    return [styles.input, focusStyle];
  };

  return (
    <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(200)} style={styles.overlay}>
      <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFillObject} />

      <Animated.View entering={FadeInDown.duration(400).delay(50)} exiting={FadeOutDown.duration(200)} style={styles.modalCardContainer}>
        <BlurView intensity={80} tint="dark" style={styles.glassCard}>

          <View style={styles.header}>
            <Text style={styles.title}>Edit Task</Text>
            <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#E2E8F0" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollContainer} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            <Text style={styles.label}>Task Name <Text style={styles.optional}>(Locked)</Text></Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={[styles.input, { opacity: 0.5 }]}
                value={params.name}
                editable={false}
              />
              <Ionicons name="lock-closed" size={16} color="#64748B" style={styles.valIcon} />
            </View>

            <Text style={styles.label}>Description <Text style={styles.optional}>(Optional)</Text></Text>
            <TextInput
              style={[getInputStyle('desc'), { minHeight: 80, textAlignVertical: 'top' }]}
              placeholder="Add details..."
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={description}
              onChangeText={setDescription}
              multiline
              onFocus={() => setFocusedInput('desc')}
              onBlur={() => setFocusedInput(null)}
            />

            <Text style={styles.label}>Schedule Time</Text>
            <View style={styles.row}>
              <View style={[styles.inputWrapper, { flex: 1, alignItems: 'center' }]}>
                <TextInput
                  style={[...getInputStyle('hours', hoursVal), styles.timeInput]}
                  placeholder="HH"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  keyboardType="number-pad"
                  maxLength={2}
                  scrollEnabled={false}
                  value={hours}
                  onChangeText={setHours}
                  onFocus={() => setFocusedInput('hours')}
                  onBlur={() => setFocusedInput(null)}
                />
              </View>
              <Text style={styles.colon}>:</Text>
              <View style={[styles.inputWrapper, { flex: 1, alignItems: 'center' }]}>
                <TextInput
                  style={[...getInputStyle('minutes', minsVal), styles.timeInput]}
                  placeholder="MM"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  keyboardType="number-pad"
                  maxLength={2}
                  scrollEnabled={false}
                  value={minutes}
                  onChangeText={setMinutes}
                  onFocus={() => setFocusedInput('minutes')}
                  onBlur={() => setFocusedInput(null)}
                />
              </View>
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

            <Text style={styles.label}>Duration (Mins) <Text style={styles.optional}>(Opt)</Text></Text>
            <TextInput
              style={getInputStyle('duration')}
              placeholder="e.g. 30"
              placeholderTextColor="rgba(255,255,255,0.3)"
              keyboardType="number-pad"
              value={duration}
              onChangeText={setDuration}
              onFocus={() => setFocusedInput('duration')}
              onBlur={() => setFocusedInput(null)}
            />

            <View style={{ flexDirection: 'row', gap: 16, marginTop: 24, marginBottom: -4 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { marginTop: 0 }]}>Reward Points</Text>
                <TextInput
                  style={getInputStyle('points', getValidationState('points', points))}
                  placeholder="10"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  keyboardType="number-pad"
                  value={points}
                  onChangeText={setPoints}
                  onFocus={() => setFocusedInput('points')}
                  onBlur={() => setFocusedInput(null)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { marginTop: 0 }]}>Penalty Points</Text>
                <TextInput
                  style={getInputStyle('penalty', getValidationState('penalty', penaltyPoints))}
                  placeholder="0"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  keyboardType="number-pad"
                  value={penaltyPoints}
                  onChangeText={setPenaltyPoints}
                  onFocus={() => setFocusedInput('penalty')}
                  onBlur={() => setFocusedInput(null)}
                />
              </View>
            </View>

            <Text style={styles.label}>Recurrence Options</Text>
            <View style={styles.recurrenceRow}>
              {(['daily', 'weekly', 'custom_days'] as Recurrence[]).map(r => (
                <TouchableOpacity
                  key={r}
                  style={[styles.recurrenceBtn, recurrence === r && styles.recurrenceBtnActive]}
                  onPress={() => setRecurrence(r)}
                >
                  <Text style={[styles.recurrenceBtnText, recurrence === r && styles.recurrenceBtnTextActive]}>
                    {r === 'daily' ? 'Daily' : r === 'weekly' ? 'Weekly' : 'Every N Days'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {recurrence === 'weekly' && (
              <>
                <Text style={[styles.label, { marginTop: 16 }]}>Select days</Text>
                <View style={styles.daysRow}>
                  {DAYS.map((day, index) => (
                    <TouchableOpacity
                      key={day}
                      style={[styles.dayBtn, customDays.includes(index) && styles.dayBtnActive]}
                      onPress={() => toggleDay(index)}
                    >
                      <Text style={[styles.dayBtnText, customDays.includes(index) && styles.dayBtnTextActive]}>
                        {day.substring(0, 1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {recurrence === 'custom_days' && (
              <>
                <Text style={[styles.label, { marginTop: 16 }]}>Repeat every N days</Text>
                <TextInput
                  style={getInputStyle('repeat')}
                  placeholder="3"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  keyboardType="number-pad"
                  value={repeatEvery}
                  onChangeText={setRepeatEvery}
                  onFocus={() => setFocusedInput('repeat')}
                  onBlur={() => setFocusedInput(null)}
                />
              </>
            )}

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 24, marginBottom: 16 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { marginTop: 0 }]}>Start Date <Text style={styles.optional}>(Opt)</Text></Text>
                <TextInput
                  style={[...getInputStyle('start'), { fontSize: 13, paddingHorizontal: 10, textAlign: 'center' }]}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={startDate}
                  maxLength={10}
                  onChangeText={(val) => setStartDate(formatDateInput(val))}
                  keyboardType="number-pad"
                  onFocus={() => setFocusedInput('start')}
                  onBlur={() => setFocusedInput(null)}
                />
              </View>
              <View style={styles.divider} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { marginTop: 0 }]}>End Date <Text style={styles.optional}>(Opt)</Text></Text>
                <TextInput
                  style={[...getInputStyle('end'), { fontSize: 13, paddingHorizontal: 10, textAlign: 'center' }]}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={endDate}
                  maxLength={10}
                  onChangeText={(val) => setEndDate(formatDateInput(val))}
                  keyboardType="number-pad"
                  onFocus={() => setFocusedInput('end')}
                  onBlur={() => setFocusedInput(null)}
                />
              </View>
            </View>

            <Text style={styles.label}>Alarm Sound</Text>
            <View style={styles.recurrenceRow}>
              {SOUNDS.map(s => (
                <TouchableOpacity
                  key={s}
                  style={[styles.recurrenceBtn, sound === s && styles.recurrenceBtnActive]}
                  onPress={() => setSound(s)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {sound === s && <Ionicons name="volume-medium" size={14} color="#38BDF8" />}
                    <Text style={[styles.recurrenceBtnText, sound === s && styles.recurrenceBtnTextActive]}>
                      {s}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.bottomActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.submitBtnWrapper} onPress={handleSave} disabled={isSubmitting}>
                <LinearGradient
                  colors={['rgba(78, 175, 255, 0.9)', 'rgba(0, 90, 165, 0.9)']}
                  style={styles.submitLinear}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Text style={styles.submitText}>{isSubmitting ? 'Saving...' : 'Save Changes'}</Text>
                  {!isSubmitting && <Ionicons name="sparkles" size={18} color="#FFF" style={{ marginLeft: 8 }} />}
                </LinearGradient>
              </TouchableOpacity>
            </View>

          </ScrollView>
        </BlurView>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCardContainer: {
    width: '92%',
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 30 },
    shadowOpacity: 0.8,
    shadowRadius: 40,
    elevation: 24,
  },
  glassCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
    backgroundColor: 'rgba(15, 18, 24, 0.65)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFF',
    letterSpacing: -0.5,
    textShadowColor: 'rgba(255,255,255,0.3)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  scrollContainer: {
    paddingHorizontal: 24,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    marginBottom: 8,
    marginTop: 20,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  optional: {
    color: '#475569',
    fontWeight: '500',
    fontSize: 10,
    textTransform: 'none',
  },
  inputWrapper: {
    position: 'relative',
    justifyContent: 'center',
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    color: '#FFF',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  inputFocused: {
    borderColor: 'rgba(56, 189, 248, 0.6)',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#38BDF8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  inputFocusedGreen: {
    borderColor: 'rgba(34, 197, 94, 0.6)',
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  inputFocusedRed: {
    borderColor: 'rgba(239, 68, 68, 0.6)',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  inputError: {
    borderColor: 'rgba(239, 68, 68, 0.7)',
    backgroundColor: 'rgba(239, 68, 68, 0.06)',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  inputSuccess: {
    borderColor: 'rgba(34, 197, 94, 0.5)',
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  valIcon: {
    position: 'absolute',
    right: 14,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    marginTop: 6,
    fontWeight: '500',
    marginLeft: 4,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  timeInput: { textAlign: 'center', fontSize: 18, fontWeight: '600', minWidth: 46 },
  colon: { fontSize: 24, fontWeight: 'bold', marginHorizontal: 8, color: '#64748B' },
  amPmContainer: {
    flexDirection: 'row',
    marginLeft: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden'
  },
  amPmBtn: { paddingHorizontal: 16, paddingVertical: 14 },
  amPmBtnActive: { backgroundColor: 'rgba(255, 255, 255, 0.1)' },
  amPmText: { color: '#64748B', fontSize: 13, fontWeight: '700' },
  amPmTextActive: { color: '#38BDF8', textShadowColor: '#38BDF8', textShadowRadius: 6 },
  recurrenceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  recurrenceBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)'
  },
  recurrenceBtnActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderColor: 'rgba(56, 189, 248, 0.5)',
    shadowColor: '#38BDF8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
  },
  recurrenceBtnText: { color: '#94A3B8', fontSize: 13, fontWeight: '600' },
  recurrenceBtnTextActive: { color: '#38BDF8', textShadowColor: '#38BDF8', textShadowRadius: 6, fontWeight: '700' },
  daysRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  dayBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center', alignItems: 'center'
  },
  dayBtnActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.1)', borderColor: 'rgba(56, 189, 248, 0.5)',
    shadowColor: '#38BDF8', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 10
  },
  dayBtnText: { color: '#94A3B8', fontSize: 14, fontWeight: '600' },
  dayBtnTextActive: { color: '#38BDF8', fontWeight: '800' },
  divider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginTop: 24,
    marginBottom: 8,
  },
  bottomActions: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 40,
    marginBottom: 24,
  },
  cancelBtn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  cancelBtnText: {
    color: '#CBD5E1',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  submitBtnWrapper: {
    flex: 1.5,
    borderRadius: 16,
    shadowColor: '#38BDF8',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  submitLinear: {
    flexDirection: 'row',
    borderRadius: 16,
    paddingVertical: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  submitText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 6,
  },
});