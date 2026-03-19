import { AppTheme } from '@/constants/theme';
import { cancelAllScheduledNotifications } from '@/services/notifications';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import { DeviceEventEmitter, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

export const EMERGENCY_KEY = 'friction_emergency_mode';
export const EMERGENCY_START_KEY = 'friction_emergency_start';
export const EMERGENCY_EVENT = 'EMERGENCY_STATE_CHANGED';

export async function checkEmergencyMode(): Promise<boolean> {
    try {
        const val = await AsyncStorage.getItem(EMERGENCY_KEY);
        return val === 'true';
    } catch {
        return false;
    }
}

export async function setEmergencyMode(active: boolean, reason?: string) {
    try {
        await AsyncStorage.setItem(EMERGENCY_KEY, active ? 'true' : 'false');
        if (active) {
            // Record start time right as it locks
            await AsyncStorage.setItem(EMERGENCY_START_KEY, new Date().toISOString());
            await cancelAllScheduledNotifications();
        } else {
            // It was unlocked, calculate duration and log
            const startStr = await AsyncStorage.getItem(EMERGENCY_START_KEY);
            if (startStr) {
                const startTime = new Date(startStr);
                const endTime = new Date();
                const durationMs = endTime.getTime() - startTime.getTime();
                const durationMinutes = durationMs / 60000;

                await AsyncStorage.removeItem(EMERGENCY_START_KEY);

                const { logEmergencyHistory } = await import('@/services/database');
                await logEmergencyHistory(startTime.toISOString(), endTime.toISOString(), durationMinutes, reason || 'Emergency Lock Active');
            }
        }
        DeviceEventEmitter.emit(EMERGENCY_EVENT, active);
    } catch { }
}

const SIZE = 320;
const CENTER = SIZE / 2;
const KNOB_R = 30;
const SPIRAL_TURNS = 2.5; // 2.5 full loops to reach center
const THETA_MAX = SPIRAL_TURNS * 2 * Math.PI;
const MAX_RADIUS = (SIZE / 2) - KNOB_R - 5;
const B = MAX_RADIUS / THETA_MAX;

// Generate SVG Path
function getSpiralPath() {
    const points = [];
    for (let t = THETA_MAX; t >= 0; t -= 0.1) {
        const r = B * t;
        const x = CENTER + r * Math.cos(t);
        const y = CENTER + r * Math.sin(t);
        points.push(`${t === THETA_MAX ? 'M' : 'L'} ${x} ${y}`);
    }
    return points.join(' ');
}

export function EmergencySpiral({ onStateChange }: { onStateChange?: (active: boolean) => void }) {
    const theta = useSharedValue(THETA_MAX); // Start at the outermost point (Not active)
    const isEmergency = useSharedValue(false);
    const [isActive, setIsActive] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [reason, setReason] = useState('');

    useEffect(() => {
        checkEmergencyMode().then(active => {
            isEmergency.value = active;
            setIsActive(active);
            theta.value = active ? 0 : THETA_MAX;
        });
    }, []);

    const handleStateChange = (active: boolean, reasonText?: string) => {
        isEmergency.value = active;
        setIsActive(active);
        setEmergencyMode(active, reasonText);
        onStateChange?.(active);
    };

    const triggerDeactivation = () => {
        setModalVisible(true);
    };

    const submitDeactivation = () => {
        setModalVisible(false);
        handleStateChange(false, reason);
        setReason('');
    };

    const panGesture = Gesture.Pan()
        .onUpdate((e) => {
            const dx = e.x - CENTER;
            const dy = e.y - CENTER;

            let currentRaw = Math.atan2(dy, dx);
            if (currentRaw < 0) currentRaw += 2 * Math.PI;

            let currentModulo = theta.value % (2 * Math.PI);
            if (currentModulo < 0) currentModulo += 2 * Math.PI;

            let dTheta = currentRaw - currentModulo;

            // Normalize to shortest path [-PI, PI]
            if (dTheta > Math.PI) dTheta -= 2 * Math.PI;
            if (dTheta < -Math.PI) dTheta += 2 * Math.PI;

            let newTheta = theta.value + dTheta;

            // Clamp strictly
            if (newTheta > THETA_MAX) newTheta = THETA_MAX;
            if (newTheta < 0) newTheta = 0;

            theta.value = newTheta;
        })
        .onEnd(() => {
            const SNAP_THRESHOLD = Math.PI; // Half turn threshold to lock/unlock
            const springConfig = { damping: 14, stiffness: 100, overshootClamping: true };
            if (theta.value < SNAP_THRESHOLD) {
                // Reached center - ACTIVATE
                theta.value = withSpring(0, springConfig);
                if (!isEmergency.value) runOnJS(handleStateChange)(true, undefined);
            } else if (theta.value > THETA_MAX - SNAP_THRESHOLD) {
                // Reached end - DEACTIVATE
                theta.value = withSpring(THETA_MAX, springConfig);
                if (isEmergency.value) runOnJS(triggerDeactivation)();
            } else {
                // Did not reach an edge, snap back to wherever it started
                theta.value = withSpring(isEmergency.value ? 0 : THETA_MAX, springConfig);
            }
        });

    const knobStyle = useAnimatedStyle(() => {
        // Clamp strictly for visuals so even if spring bounces under the hood, the knob CANNOT leave the track graphically.
        const clampedTheta = Math.max(0, Math.min(theta.value, THETA_MAX));
        const r = B * clampedTheta;
        const x = CENTER + r * Math.cos(clampedTheta) - KNOB_R;
        const y = CENTER + r * Math.sin(clampedTheta) - KNOB_R;

        return {
            transform: [{ translateX: x }, { translateY: y }],
            backgroundColor: theta.value < Math.PI ? AppTheme.accentRed : AppTheme.surface,
            borderColor: theta.value < Math.PI ? '#fff' : AppTheme.border,
        };
    });

    return (
        <View style={styles.container}>
            <Text style={[styles.title, isActive && styles.titleActive]}>
                {isActive ? 'EMERGENCY MODE ACTIVE' : 'Emergency Freeze'}
            </Text>
            <Text style={styles.subtitle}>
                {isActive ? 'All alarms and tasks are silenced. Drag out to resume.' : 'Drag the knot to the center to silence all alarms.'}
            </Text>

            <GestureDetector gesture={panGesture}>
                <View style={{ width: SIZE, height: SIZE, marginTop: 20 }}>
                    <Svg width={SIZE} height={SIZE}>
                        <Path
                            d={getSpiralPath()}
                            stroke={isActive ? AppTheme.accentRed : AppTheme.border}
                            strokeWidth={4}
                            strokeDasharray="4 8"
                            fill="none"
                            strokeLinecap="round"
                        />
                    </Svg>
                    <View style={styles.centerTarget}>
                        <Ionicons name="warning" size={24} color={isActive ? AppTheme.accentRed : AppTheme.textMuted} />
                    </View>
                    <Animated.View style={[styles.knob, knobStyle]}>
                        <Ionicons name="code-working-outline" size={24} color={AppTheme.textSecondary} />
                    </Animated.View>
                </View>
            </GestureDetector>

            <Modal visible={modalVisible} transparent={true} animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Emergency Over</Text>
                        <Text style={styles.modalSubtitle}>Please log a reason for freezing the app.</Text>
                        <TextInput
                            style={styles.reasonInput}
                            placeholder="e.g. Feeling overwhelmed..."
                            placeholderTextColor={AppTheme.textMuted}
                            value={reason}
                            onChangeText={setReason}
                            autoFocus
                        />
                        <TouchableOpacity
                            style={[styles.saveBtn, !reason.trim() && { opacity: 0.5 }]}
                            disabled={!reason.trim()}
                            onPress={submitDeactivation}
                        >
                            <Text style={styles.saveBtnText}>Save Record</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
        marginBottom: 24,
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
        color: AppTheme.text,
        letterSpacing: 1,
    },
    titleActive: {
        color: AppTheme.accentRed,
    },
    subtitle: {
        fontSize: 13,
        color: AppTheme.textSecondary,
        textAlign: 'center',
        marginTop: 8,
        lineHeight: 18,
    },
    centerTarget: {
        position: 'absolute',
        left: CENTER - 18,
        top: CENTER - 18,
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: AppTheme.surface,
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    knob: {
        position: 'absolute',
        width: KNOB_R * 2,
        height: KNOB_R * 2,
        borderRadius: KNOB_R,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 5,
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    modalContent: {
        width: '100%',
        backgroundColor: AppTheme.surface,
        borderRadius: 16,
        padding: 24,
        borderWidth: 1,
        borderColor: AppTheme.border,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: AppTheme.text,
        marginBottom: 8,
    },
    modalSubtitle: {
        fontSize: 14,
        color: AppTheme.textSecondary,
        marginBottom: 20,
    },
    reasonInput: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: AppTheme.border,
        borderRadius: 8,
        color: AppTheme.text,
        padding: 16,
        fontSize: 16,
        marginBottom: 24,
    },
    saveBtn: {
        backgroundColor: AppTheme.accentGreen,
        borderRadius: 8,
        padding: 16,
        alignItems: 'center',
    },
    saveBtnText: {
        color: AppTheme.background,
        fontSize: 16,
        fontWeight: 'bold',
    }
});
