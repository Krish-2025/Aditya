import { checkEmergencyMode } from '@/components/EmergencySpiral';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppTheme } from '@/constants/theme';
import { deleteTask, getTasks, initDatabase } from '@/services/database';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Task = {
  id: string;
  name: string;
  description: string;
  scheduledTime: string;
  duration: number;
  points: number;
  penaltyPoints: number;
  status: string;
  recurrence: string;
  recurrenceValue: number;
  recurrenceDays: string;
  soundName: string;
};

const RECURRENCE_LABELS: Record<string, string> = {
  once: 'Once', daily: 'Daily', weekly: 'Weekly', custom_days: 'Every N days',
};

export default function ManageTasksScreen() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLocked, setIsLocked] = useState(false);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        await initDatabase();
        setTasks(await getTasks());
        setIsLocked(await checkEmergencyMode());
      })();
    }, [])
  );

  const handleDelete = (id: string, name: string) => {
    Alert.alert(
      'Delete Task',
      `Delete "${name}"? Its history will be kept for tracking.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            await deleteTask(id);
            setTasks(prev => prev.filter(t => t.id !== id));
          }
        }
      ]
    );
  };

  const handleEdit = (task: Task) => {
    router.push({
      pathname: '/edit-task',
      params: {
        id: task.id,
        name: task.name,
        description: task.description || '',
        scheduledTime: task.scheduledTime,
        duration: task.duration.toString(),
        points: task.points.toString(),
        penaltyPoints: (task.penaltyPoints || 0).toString(),
        recurrence: task.recurrence,
        recurrenceValue: task.recurrenceValue.toString(),
        recurrenceDays: task.recurrenceDays,
        soundName: task.soundName || 'default',
      }
    });
  };

  return (
    <ScreenContainer>
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={AppTheme.background} />
        <View style={styles.header}>
          <View>
            <Text style={styles.headerLabel}>MANAGE TASKS</Text>
            <Text style={styles.headerDate}>{tasks.length} task{tasks.length !== 1 ? 's' : ''} total</Text>
          </View>
        </View>

        {isLocked ? (
          <View style={styles.empty}>
            <Ionicons name="lock-closed-outline" size={64} color={AppTheme.accentRed} />
            <Text style={[styles.emptyText, { color: AppTheme.accentRed }]}>EMERGENCY LOCK ACTIVE</Text>
            <Text style={[styles.emptySubText, { textAlign: 'center', marginTop: 12, lineHeight: 20 }]}>
              Task management is completely disabled.{"\n"}
              Disable Emergency Freeze in Settings to unlock.
            </Text>
          </View>
        ) : tasks.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="clipboard-outline" size={64} color={AppTheme.textMuted} />
            <Text style={styles.emptyText}>No tasks yet.</Text>
            <Text style={styles.emptySubText}>Tap + to create your first task.</Text>
          </View>
        ) : (
          <FlatList
            data={tasks}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: 100 }}
            renderItem={({ item }) => (
              <View style={styles.taskCard}>
                <View style={styles.taskInfo}>
                  <Text style={styles.taskName}>{item.name}</Text>
                  <Text style={styles.taskMeta}>
                    {item.scheduledTime} · {item.duration} min · {item.points} pts · {RECURRENCE_LABELS[item.recurrence] || 'Once'}
                  </Text>
                </View>
                <View style={styles.actions}>
                  <TouchableOpacity style={styles.editBtn} onPress={() => handleEdit(item)}>
                    <Ionicons name="pencil-outline" size={18} color={AppTheme.accent} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item.id, item.name)}>
                    <Ionicons name="trash-outline" size={18} color={AppTheme.accentRed} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        )}

        {!isLocked && (
          <TouchableOpacity style={styles.addButton} onPress={() => router.push('/modal')}>
            <Ionicons name="add" size={32} color={AppTheme.background} />
          </TouchableOpacity>
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 50, marginBottom: 32 },
  headerLabel: { fontSize: 11, color: AppTheme.accent, fontWeight: '700', letterSpacing: 3, marginBottom: 4 },
  headerDate: { fontSize: 20, color: AppTheme.text, fontWeight: '700' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 18, color: AppTheme.textSecondary, marginTop: 16, fontWeight: '600' },
  emptySubText: { fontSize: 14, color: AppTheme.textMuted, marginTop: 8 },
  taskCard: { backgroundColor: AppTheme.surface, borderRadius: 14, padding: 18, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: AppTheme.border },
  taskInfo: { flex: 1 },
  taskName: { fontSize: 15, fontWeight: '600', color: AppTheme.text, marginBottom: 4 },
  taskMeta: { fontSize: 12, color: AppTheme.textSecondary },
  actions: { flexDirection: 'row', gap: 12 },
  editBtn: { padding: 8 },
  deleteBtn: { padding: 8 },
  addButton: { position: 'absolute', bottom: 30, right: 30, backgroundColor: AppTheme.accent, width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 5 },
});