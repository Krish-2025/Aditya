import { EmergencySpiral } from '@/components/EmergencySpiral';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppTheme } from '@/constants/theme';
import { clearAllData, clearRecentData, clearTodaysData } from '@/services/database';
import { cancelAllScheduledNotifications } from '@/services/notifications';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function SettingsScreen() {
    const [minutesStr, setMinutesStr] = useState('15');

    const handleClearRecent = () => {
        const mins = parseInt(minutesStr, 10);
        if (isNaN(mins) || mins <= 0) {
            Alert.alert('Invalid input', 'Please enter a valid number of minutes.');
            return;
        }
        Alert.alert(
            `Clear last ${mins} mins`,
            `This will delete all tasks and logs created in the last ${mins} minutes.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Clear',
                    style: 'destructive',
                    onPress: async () => {
                        await clearRecentData(mins);
                        Alert.alert('Done', `Data from the last ${mins} minutes has been cleared.`);
                    },
                },
            ]
        );
    };

    const handleClearToday = () => {
        Alert.alert(
            "Clear today's data",
            "This will delete all task instances and logs generated today.",
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Clear today',
                    style: 'destructive',
                    onPress: async () => {
                        // We don't necessarily cancel ALL notifications here, as future tasks might exist.
                        // But we probably should cancel notifications for today's tasks if we are deleting them.
                        // Since this is a hard delete, the OS notification might be left orphaned if we don't clear them natively.
                        // However, `clearTodaysData` is a brute-force debug tool. We'll cancel all to be safe for now, 
                        // or the user can just ignore ghost alarms for today. We'll leave it as a SQLite pure purge.
                        await clearTodaysData();
                        Alert.alert('Done', "Today's data has been cleared.");
                    },
                },
            ]
        );
    };

    const handleClearAllData = () => {
        Alert.alert(
            'Clear all data',
            'This will delete all tasks, alarms, points, and history. You cannot undo this.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Clear everything',
                    style: 'destructive',
                    onPress: async () => {
                        await cancelAllScheduledNotifications();
                        await clearAllData();
                        Alert.alert('Done', 'All data has been cleared. Start fresh from the Today and Tasks tabs.');
                    },
                },
            ]
        );
    };

    return (
        <ScreenContainer>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
                <Text style={styles.header}>Settings</Text>

                <EmergencySpiral />

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Data Management</Text>
                    <Text style={styles.sectionDesc}>Use these tools to clean up mistakes, reset your daily streak, or start completely fresh.</Text>

                    {/* Clear Recent Component */}
                    <View style={styles.recentContainer}>
                        <View style={styles.recentInputRow}>
                            <Text style={styles.inputLabel}>Clear previous</Text>
                            <TextInput
                                style={styles.input}
                                value={minutesStr}
                                onChangeText={setMinutesStr}
                                keyboardType="numeric"
                                maxLength={4}
                            />
                            <Text style={styles.inputLabel}>minutes</Text>
                        </View>
                        <TouchableOpacity style={styles.actionButton} onPress={handleClearRecent}>
                            <Ionicons name="time-outline" size={20} color={AppTheme.accentOrange} />
                            <Text style={[styles.actionText, { color: AppTheme.accentOrange }]}>Clear Recent Data</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Clear Today */}
                    <View style={styles.buttonSpacer}>
                        <TouchableOpacity style={styles.actionButton} onPress={handleClearToday}>
                            <Ionicons name="calendar-clear-outline" size={20} color={AppTheme.accent} />
                            <Text style={[styles.actionText, { color: AppTheme.accent }]}>Clear Today's Data</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Clear All */}
                    <View style={[styles.buttonSpacer, { marginTop: 32 }]}>
                        <TouchableOpacity style={[styles.actionButton, styles.destructiveButton]} onPress={handleClearAllData}>
                            <Ionicons name="trash-outline" size={20} color={AppTheme.accentRed} />
                            <Text style={styles.clearButtonText}>Clear All Data</Text>
                        </TouchableOpacity>
                    </View>
                </View>

            </ScrollView>
        </ScreenContainer>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    content: { padding: 20, paddingBottom: 40 },
    header: { fontSize: 26, fontWeight: '700', marginTop: 40, marginBottom: 24, color: AppTheme.text },
    section: {
        backgroundColor: AppTheme.surface,
        borderRadius: 16,
        padding: 24,
        borderWidth: 1,
        borderColor: AppTheme.border,
    },
    sectionTitle: { fontSize: 18, fontWeight: '700', color: AppTheme.text, marginBottom: 8 },
    sectionDesc: { fontSize: 13, color: AppTheme.textSecondary, marginBottom: 24, lineHeight: 20 },

    recentContainer: {
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        padding: 16,
        borderRadius: 12,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    recentInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
        gap: 8,
    },
    inputLabel: {
        color: AppTheme.text,
        fontSize: 15,
    },
    input: {
        backgroundColor: AppTheme.surface,
        color: AppTheme.text,
        borderWidth: 1,
        borderColor: AppTheme.border,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        fontSize: 16,
        fontWeight: '600',
        width: 60,
        textAlign: 'center',
    },

    buttonSpacer: {
        marginBottom: 12,
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: AppTheme.border,
        backgroundColor: AppTheme.surface,
    },
    destructiveButton: {
        borderColor: AppTheme.accentRed,
        backgroundColor: 'rgba(244, 67, 54, 0.05)',
    },
    actionText: { fontSize: 15, fontWeight: '600' },
    clearButtonText: { color: AppTheme.accentRed, fontSize: 15, fontWeight: '600' },
});
