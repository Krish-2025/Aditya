import { MaterialTopTabs } from '@/components/MaterialTopTabs';
import { AppTheme } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';

export default function TabLayout() {
  return (
    <MaterialTopTabs
      tabBarPosition="bottom"
      initialRouteName="index"
      screenOptions={{
        tabBarActiveTintColor: AppTheme.accent,
        tabBarInactiveTintColor: AppTheme.textMuted,
        tabBarStyle: {
          backgroundColor: AppTheme.tabBarBg,
          borderTopWidth: 1,
          borderTopColor: AppTheme.tabBarBorder,
          // Extra bottom padding for iOS home indicator
          paddingBottom: Platform.OS === 'ios' ? 20 : 0,
        },
        tabBarIndicatorStyle: {
          height: 3,
          backgroundColor: AppTheme.accent,
          top: 0, // Put the indicator on top of the bottom tab bar
        },
        tabBarShowIcon: true,
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontSize: 10,
          textTransform: 'none',
          marginTop: 2,
        },
        swipeEnabled: true,
        // CRITICAL: make the screen background fully transparent so the global DotGrid shows natively!
        sceneStyle: { backgroundColor: 'transparent' },
      }}
    >
      <MaterialTopTabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarIcon: ({ color }) => <Ionicons name="sunny-outline" size={24} color={color} />,
        }}
      />

      <MaterialTopTabs.Screen
        name="manage"
        options={{
          title: 'Tasks',
          tabBarIcon: ({ color }) => <Ionicons name="checkbox-outline" size={24} color={color} />,
        }}
      />
      <MaterialTopTabs.Screen
        name="sleep"
        options={{
          title: 'Sleep',
          tabBarIcon: ({ color }) => <Ionicons name="moon-outline" size={24} color={color} />,
        }}
      />
      <MaterialTopTabs.Screen
        name="trace"
        options={{
          title: 'Trace',
          tabBarIcon: ({ color }) => <Ionicons name="stats-chart" size={24} color={color} />,
        }}
      />
      <MaterialTopTabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <Ionicons name="settings-outline" size={24} color={color} />,
        }}
      />
    </MaterialTopTabs>
  );
}