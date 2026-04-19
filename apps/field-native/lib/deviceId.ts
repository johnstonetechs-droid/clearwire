import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'clearwire.deviceId';

/**
 * Returns a stable anonymous device ID. Created on first call,
 * persisted in AsyncStorage. Used for rate limiting anon submissions.
 */
export async function getDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(KEY);
  if (existing) return existing;

  const id = `anon_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
  await AsyncStorage.setItem(KEY, id);
  return id;
}
