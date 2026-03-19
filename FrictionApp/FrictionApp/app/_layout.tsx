import { DotGrid } from '@/components/DotGrid';
import { checkEmergencyMode, EMERGENCY_EVENT } from '@/components/EmergencySpiral';
import { AppTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { triggerAlarm } from '@/services/alarmManager';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { DeviceEventEmitter, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [isEmergency, setIsEmergency] = useState(false);

  useEffect(() => {
    checkEmergencyMode().then(setIsEmergency);
    const sub = DeviceEventEmitter.addListener(EMERGENCY_EVENT, (active: boolean) => {
      setIsEmergency(active);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    // Auto-navigate when a notification fires in the foreground (both Phase 1 and Phase 2)
    const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      const data: any = notification.request.content.data;
      if (data?.route === '/alarm' && data?.taskId && data?.phase) {
        triggerAlarm(data.taskId, data.phase, data);
      }
    });

    // Navigate when the user taps a notification (app in background/killed)
    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data: any = response.notification.request.content.data;
      if (data?.route === '/alarm' && data?.taskId && data?.phase) {
        triggerAlarm(data.taskId, data.phase, data);
      }
    });

    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, []);

  const AppNavTheme = {
    ...(colorScheme === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(colorScheme === 'dark' ? DarkTheme.colors : DefaultTheme.colors),
      background: 'transparent',
    }
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={AppNavTheme}>
        <View style={{ flex: 1, backgroundColor: AppTheme.background }}>
          <DotGrid isEmergency={isEmergency} />
          <Stack screenOptions={{ contentStyle: { backgroundColor: 'transparent' } }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="alarm" options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false }} />
            <Stack.Screen name="modal" options={{ headerShown: false, presentation: 'transparentModal', animation: 'fade' }} />
            <Stack.Screen name="edit-task" options={{ headerShown: false, presentation: 'transparentModal', animation: 'fade' }} />
          </Stack>
        </View>
        <StatusBar style="light" />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}