import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

// Show notifications that arrive while the app is foregrounded. Default
// behavior in Expo is to suppress the banner — we want crews to see it.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Android requires an explicit notification channel; without one pushes
// are silently dropped on Android 8+. Safe to call repeatedly.
export async function setupAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Proximity alerts',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#2563EB',
  });
}

export type RegisterResult =
  | { ok: true; token: string }
  | { ok: false; reason: string };

/**
 * Request notification permission and fetch the Expo push token.
 * In Expo Go this returns an ExponentPushToken; in standalone builds
 * the same call returns a project-scoped token (requires projectId
 * wired up in app.config).
 */
export async function registerForPushNotificationsAsync(): Promise<RegisterResult> {
  if (!Device.isDevice) {
    return { ok: false, reason: 'Push notifications require a physical device.' };
  }

  await setupAndroidChannel();

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== 'granted') {
    return { ok: false, reason: 'Notification permission was denied.' };
  }

  try {
    const res = await Notifications.getExpoPushTokenAsync();
    return { ok: true, token: res.data };
  } catch (e: any) {
    return { ok: false, reason: e?.message ?? 'Failed to get push token.' };
  }
}

/**
 * Send a test push directly via Expo's push API so the user can verify
 * registration end-to-end without waiting for a real report.
 */
export async function sendTestPush(token: string, message: string): Promise<string | null> {
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: token,
        sound: 'default',
        title: 'ClearWire test',
        body: message,
        priority: 'high',
      }),
    });
    const json = await res.json();
    // Expo returns { data: { status: 'ok' | 'error', message, details } }
    if (json?.data?.status === 'ok') return null;
    return json?.data?.message ?? json?.errors?.[0]?.message ?? 'Unknown push error';
  } catch (e: any) {
    return e?.message ?? 'Push request failed';
  }
}
