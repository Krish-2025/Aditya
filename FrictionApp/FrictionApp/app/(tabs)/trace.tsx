import { ScreenContainer } from '@/components/ScreenContainer';
import { AppTheme } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

export default function TraceScreen() {
  return (
    <ScreenContainer>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.header}>Trace</Text>

        <View style={styles.row}>
          <View style={[styles.card, styles.cardGreen]}>
            <Ionicons name="checkmark-circle-outline" size={32} color={AppTheme.accentGreen} />
            <Text style={styles.cardNumber}>0</Text>
            <Text style={styles.cardLabel}>Tasks Done</Text>
          </View>
          <View style={[styles.card, styles.cardRed]}>
            <Ionicons name="close-circle-outline" size={32} color={AppTheme.accentRed} />
            <Text style={styles.cardNumber}>0</Text>
            <Text style={styles.cardLabel}>Skipped</Text>
          </View>
        </View>

        <View style={styles.row}>
          <View style={[styles.card, styles.cardBlue]}>
            <Ionicons name="moon-outline" size={32} color={AppTheme.accent} />
            <Text style={styles.cardNumber}>0h</Text>
            <Text style={styles.cardLabel}>Sleep Last Night</Text>
          </View>
          <View style={[styles.card, styles.cardOrange]}>
            <Ionicons name="flame-outline" size={32} color={AppTheme.accentOrange} />
            <Text style={styles.cardNumber}>0</Text>
            <Text style={styles.cardLabel}>Day Streak</Text>
          </View>
        </View>

        <View style={styles.graphPlaceholder}>
          <Ionicons name="bar-chart-outline" size={48} color={AppTheme.textMuted} />
          <Text style={styles.graphText}>Task completion graph will appear here as you log tasks.</Text>
        </View>

        <View style={styles.graphPlaceholder}>
          <Ionicons name="time-outline" size={48} color={AppTheme.textMuted} />
          <Text style={styles.graphText}>Sleep pattern graph will appear here as you log sleep.</Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  header: { fontSize: 26, fontWeight: '700', marginTop: 40, marginBottom: 24, color: AppTheme.text },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  card: { width: '48%', backgroundColor: AppTheme.surface, borderRadius: 16, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: AppTheme.border },
  cardGreen: { borderTopWidth: 3, borderTopColor: AppTheme.accentGreen },
  cardRed: { borderTopWidth: 3, borderTopColor: AppTheme.accentRed },
  cardBlue: { borderTopWidth: 3, borderTopColor: AppTheme.accent },
  cardOrange: { borderTopWidth: 3, borderTopColor: AppTheme.accentOrange },
  cardNumber: { fontSize: 28, fontWeight: '700', color: AppTheme.text, marginTop: 8 },
  cardLabel: { fontSize: 12, color: AppTheme.textSecondary, marginTop: 4, textAlign: 'center' },
  graphPlaceholder: { backgroundColor: AppTheme.surface, borderRadius: 16, padding: 30, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: AppTheme.border },
  graphText: { color: AppTheme.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 12 },
});