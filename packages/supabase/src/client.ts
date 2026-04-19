import { createClient, SupabaseClient } from '@supabase/supabase-js';

export type ClearWireSupabase = SupabaseClient;

/**
 * Create a Supabase client. Pass a storage adapter so the same factory
 * works in React Native (AsyncStorage) and web (localStorage).
 *
 * Usage in field-native:
 *   import AsyncStorage from '@react-native-async-storage/async-storage';
 *   export const supabase = createClearWireClient({
 *     url: process.env.EXPO_PUBLIC_SUPABASE_URL!,
 *     anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
 *     storage: AsyncStorage,
 *   });
 */
export function createClearWireClient(config: {
  url: string;
  anonKey: string;
  storage?: unknown;
}): ClearWireSupabase {
  return createClient(config.url, config.anonKey, {
    auth: {
      storage: config.storage as never,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false, // RN can't use URL detection
    },
  });
}
