import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { T } from '@clearwire/brand';

// Side-effect import: sets up foreground notification handler.
import '../lib/pushNotifications';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: T.bg },
          headerTintColor: T.text,
          headerTitleStyle: { fontWeight: '600' },
          contentStyle: { backgroundColor: T.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'ClearWire Field' }} />
        <Stack.Screen name="report" options={{ title: 'New Report' }} />
        <Stack.Screen name="map" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="auth-callback" options={{ headerShown: false }} />
        <Stack.Screen name="profile" options={{ headerShown: false }} />
      </Stack>
    </SafeAreaProvider>
  );
}
