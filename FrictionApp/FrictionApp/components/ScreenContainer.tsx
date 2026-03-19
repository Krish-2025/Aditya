import { StyleSheet, View, ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function ScreenContainer({
  children,
  style,
  ...rest
}: ViewProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, style]} {...rest}>
      <View style={[styles.content, { paddingTop: insets.top }]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    flex: 1,
  },
});
