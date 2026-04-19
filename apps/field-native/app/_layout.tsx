import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { T } from '@clearwire/brand';

// Side-effect import: sets up foreground notification handler.
import '../lib/pushNotifications';

export default function RootLayout() {
  const router = useRouter();

  // Proximity-alert pushes carry either reportId (damage) or outageId
  // (outage). Route to the matching screen with the id in the query so
  // the detail sheet opens automatically.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as
        | { reportId?: string; outageId?: string }
        | undefined;
      if (data?.reportId) {
        router.push({ pathname: '/map', params: { reportId: data.reportId } });
      } else if (data?.outageId) {
        router.push({ pathname: '/outages', params: { outageId: data.outageId } });
      }
    });
    return () => sub.remove();
  }, [router]);

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
        <Stack.Screen name="outage" options={{ headerShown: false }} />
        <Stack.Screen name="map" options={{ headerShown: false }} />
        <Stack.Screen name="outages" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="auth-callback" options={{ headerShown: false }} />
        <Stack.Screen name="profile" options={{ headerShown: false }} />
      </Stack>
    </SafeAreaProvider>
  );
}
