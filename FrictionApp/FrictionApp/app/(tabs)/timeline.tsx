import { AppTheme } from '@/constants/theme';
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

const PIXELS_PER_MINUTE = 1.2;
const HOUR_HEIGHT = 60 * PIXELS_PER_MINUTE; // 72px
const TIMELINE_HEIGHT = 24 * HOUR_HEIGHT; // 1728px
const TIME_COLUMN_WIDTH = 55;

const STATUS_COLORS: Record<string, string> = {
    SCHEDULED: AppTheme.accent,
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

type TaskInstance = {
    id: string;
    name: string;
    parentTaskId: string;
    scheduledTime: string;
    duration: number;
    status: string;
};

export function TimelineView({ tasks }: { tasks: TaskInstance[] }) {
    const { width: screenWidth } = useWindowDimensions();
    const eventsAreaWidth = screenWidth - (TIME_COLUMN_WIDTH + 5) - 15;

    const [currentTimeMin, setCurrentTimeMin] = useState(0);
    const scrollViewRef = useRef<ScrollView>(null);
    const hasScrolledRef = useRef(false);

    // Update current time every minute
    useEffect(() => {
        const updateTime = () => {
            const now = new Date();
            setCurrentTimeMin(now.getHours() * 60 + now.getMinutes());
        };
        updateTime();
        const timer = setInterval(updateTime, 60000);
        return () => clearInterval(timer);
    }, []);

    // Initial scroll to current time
    useEffect(() => {
        if (currentTimeMin > 0 && !hasScrolledRef.current && scrollViewRef.current) {
            // Scroll so the current time is roughly in the middle of the screen
            const yPos = Math.max(0, currentTimeMin * PIXELS_PER_MINUTE - 200);
            scrollViewRef.current.scrollTo({ y: yPos, animated: true });
            hasScrolledRef.current = true;
        }
    }, [currentTimeMin]);

    const hours = Array.from({ length: 25 }, (_, i) => i);

    return (
        <View style={{ flex: 1, backgroundColor: 'transparent' }}>
            <ScrollView ref={scrollViewRef} style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>

                {/* Vertical timeline divider */}
                <View style={styles.verticalDivider} />

                {/* Render hour slots (horizontal lines & labels) */}
                {hours.map((hour) => {
                    const displayHour = hour === 0 ? '' : hour === 24 ? '12 AM' : hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
                    return (
                        <View key={hour} style={[styles.hourRow, { top: hour * HOUR_HEIGHT }]}>
                            <Text style={styles.timeLabel}>{displayHour}</Text>
                            <View style={styles.hourLine} />
                        </View>
                    );
                })}

                {/* Render Task Blocks */}
                {(() => {
                    interface ParsedTask extends TaskInstance {
                        startMin: number;
                        endMin: number;
                        column?: number;
                        maxColumns?: number;
                    }

                    const parsedTasks: ParsedTask[] = tasks.map((t) => {
                        if (!t.scheduledTime) return null;
                        const parts = t.scheduledTime.split(':');
                        if (parts.length < 2) return null;
                        const startH = parseInt(parts[0], 10);
                        const startM = parseInt(parts[1], 10);
                        if (isNaN(startH) || isNaN(startM)) return null;
                        const startMin = startH * 60 + startM;
                        // Minimum height visual enforcement is mapped here so visual drawing footprint perfectly mirrors grouping algorithm footprint
                        const duration = Math.max(1, Number(t.duration) || 30);
                        const visualDurationMin = Math.max(duration, 24 / PIXELS_PER_MINUTE);
                        const endMin = startMin + visualDurationMin;
                        return { ...t, startMin, endMin, duration };
                    }).filter((t): t is ParsedTask => t !== null);

                    // Sort rigorously by start time first, then longest duration
                    parsedTasks.sort((a, b) => {
                        if (a.startMin !== b.startMin) return a.startMin - b.startMin;
                        return b.endMin - a.endMin;
                    });

                    const processedTasks: ParsedTask[] = [];
                    let cluster: ParsedTask[] = [];
                    let clusterEnd = 0;

                    const packCluster = (group: ParsedTask[]) => {
                        if (!group.length) return;
                        const columns: ParsedTask[][] = [];
                        for (const task of group) {
                            let placed = false;
                            for (let i = 0; i < columns.length; i++) {
                                const lastTask = columns[i][columns[i].length - 1];
                                // If the current task strictly starts at or after the last task ends, they can share the column vertically
                                if (lastTask.endMin <= task.startMin) {
                                    columns[i].push(task);
                                    task.column = i;
                                    placed = true;
                                    break;
                                }
                            }
                            if (!placed) {
                                task.column = columns.length;
                                columns.push([task]);
                            }
                        }
                        const maxCols = columns.length;
                        for (const task of group) {
                            task.maxColumns = maxCols;
                            processedTasks.push(task);
                        }
                    };

                    for (const task of parsedTasks) {
                        if (cluster.length > 0 && task.startMin >= clusterEnd) {
                            packCluster(cluster);
                            cluster = [];
                            clusterEnd = 0;
                        }
                        cluster.push(task);
                        clusterEnd = Math.max(clusterEnd, task.endMin);
                    }
                    if (cluster.length > 0) packCluster(cluster);

                    return (
                        <View style={styles.eventsArea}>
                            {processedTasks.map((task) => {
                                const topPos = task.startMin * PIXELS_PER_MINUTE;
                                const rawHeight = task.duration * PIXELS_PER_MINUTE;
                                const height = Math.max(rawHeight, 20);
                                const color = STATUS_COLORS[task.status] || AppTheme.accent;
                                const bgColor = color + '25';

                                const col = task.column ?? 0;
                                const totalCols = task.maxColumns ?? 1;
                                const widthPx = eventsAreaWidth / totalCols;
                                const leftPx = col * widthPx;

                                return (
                                    <View
                                        key={task.id}
                                        style={[
                                            styles.taskBlock,
                                            {
                                                top: topPos,
                                                height,
                                                borderLeftColor: color,
                                                backgroundColor: bgColor,
                                                left: leftPx,
                                                width: widthPx,
                                                // Adjust visual gaps for multi-column layouts using physical padding/margin math
                                                marginLeft: col > 0 ? 2 : 0,
                                                paddingRight: totalCols > 1 ? 4 : 8,
                                            }
                                        ]}
                                    >
                                        <Text style={[styles.taskName, { color }]} numberOfLines={1}>
                                            {task.name || task.parentTaskId}
                                        </Text>
                                    </View>
                                );
                            })}
                        </View>
                    );
                })()}

                {/* Render Current Time Indicator */}
                <View style={[styles.currentTimeContainer, { top: currentTimeMin * PIXELS_PER_MINUTE }]}>
                    <View style={styles.currentTimeDot} />
                    <View style={styles.currentTimeLine} />
                </View>

            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        paddingHorizontal: 20,
        paddingTop: 40,
        paddingBottom: 20,
        backgroundColor: 'transparent',
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: '700',
        color: AppTheme.text,
    },
    scrollContainer: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    scrollContent: {
        height: TIMELINE_HEIGHT + 100, // Extra padding at bottom
        position: 'relative',
        paddingBottom: 40,
    },
    verticalDivider: {
        position: 'absolute',
        left: TIME_COLUMN_WIDTH,
        top: 0,
        bottom: 0,
        width: 1,
        backgroundColor: AppTheme.border,
    },
    hourRow: {
        position: 'absolute',
        left: 0,
        right: 0,
        flexDirection: 'row',
        alignItems: 'center',
        height: 20,
        marginTop: -10, // centers the 20px box directly on the absolute 'top' coordinate
    },
    timeLabel: {
        width: TIME_COLUMN_WIDTH,
        textAlign: 'center',
        color: AppTheme.textMuted,
        fontSize: 10,
        fontWeight: '600',
    },
    hourLine: {
        flex: 1,
        height: 1,
        backgroundColor: AppTheme.border,
    },
    eventsArea: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: TIME_COLUMN_WIDTH + 5,
        right: 15,
    },
    taskBlock: {
        position: 'absolute',
        borderLeftWidth: 4,
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 2,
        justifyContent: 'center',
        overflow: 'hidden',
    },
    taskName: {
        fontSize: 12,
        fontWeight: '700',
    },
    currentTimeContainer: {
        position: 'absolute',
        left: TIME_COLUMN_WIDTH - 4, // Center the dot on the line boundary
        right: 0,
        flexDirection: 'row',
        alignItems: 'center',
        zIndex: 5,
        marginTop: -4, // Shifts the 8px tall dot up exactly 4px so its mathematical center perfectly aligns with the `top` offset
    },
    currentTimeDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: AppTheme.accentRed,
    },
    currentTimeLine: {
        flex: 1,
        height: 2,
        backgroundColor: AppTheme.accentRed,
        opacity: 0.8,
    }
});
