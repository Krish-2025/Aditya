import { ScreenContainer } from '@/components/ScreenContainer';
import { AppTheme } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function SleepScreen() {
  const [isSleeping, setIsSleeping] = useState(false);
  const [sleepTime, setSleepTime] = useState<string | null>(null);
  const [wakeTime, setWakeTime] = useState<string | null>(null);

  const handleSleep = () => {
    setIsSleeping(true);
    setSleepTime(new Date().toLocaleTimeString());
    setWakeTime(null);
  };

  const handleWake = () => {
    setIsSleeping(false);
    setWakeTime(new Date().toLocaleTimeString());
  };

  return (
    <ScreenContainer>
      <View style={styles.container}>
        <Text style={styles.header}>Sleep Tracker</Text>

        <View style={styles.statusCard}>
          <Ionicons
            name={isSleeping ? 'moon' : 'sunny'}
            size={64}
            color={isSleeping ? AppTheme.accent : AppTheme.accentOrange}
          />
          <Text style={styles.statusText}>
            {isSleeping ? 'Sleeping...' : 'Awake'}
          </Text>

          {sleepTime && (
            <Text style={styles.timeText}>Slept at: {sleepTime}</Text>
          )}
          {wakeTime && (
            <Text style={styles.timeText}>Woke at: {wakeTime}</Text>
          )}
        </View>

        <TouchableOpacity
          style={[styles.button, isSleeping ? styles.wakeButton : styles.sleepButton]}
          onPress={isSleeping ? handleWake : handleSleep}
        >
          <Text style={styles.buttonText}>
            {isSleeping ? "I'm Awake" : 'Going to Sleep'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.hint}>
          Tip: Shake your phone to toggle sleep/wake
        </Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  header: { fontSize: 26, fontWeight: '700', marginTop: 40, marginBottom: 30, color: AppTheme.text },
  statusCard: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: AppTheme.surface, borderRadius: 24, marginBottom: 30, borderWidth: 1, borderColor: AppTheme.border },
  statusText: { fontSize: 24, fontWeight: '600', marginTop: 16, color: AppTheme.text },
  timeText: { fontSize: 14, color: AppTheme.textSecondary, marginTop: 8 },
  button: { padding: 18, borderRadius: 16, alignItems: 'center', marginBottom: 16 },
  sleepButton: { backgroundColor: AppTheme.accent },
  wakeButton: { backgroundColor: AppTheme.accentOrange },
  buttonText: { color: AppTheme.text, fontSize: 18, fontWeight: '600' },
  hint: { textAlign: 'center', color: AppTheme.textSecondary, fontSize: 13, marginBottom: 20 },
});