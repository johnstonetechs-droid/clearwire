import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { T } from '@clearwire/brand';
import { exchangeCode } from '../lib/auth';

type Stage = 'exchanging' | 'ok' | 'error';

export default function AuthCallback() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; error?: string; error_description?: string }>();
  const [stage, setStage] = useState<Stage>('exchanging');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (params.error) {
        setStage('error');
        setMessage(params.error_description ?? params.error ?? 'Sign-in failed');
        return;
      }
      if (!params.code) {
        setStage('error');
        setMessage('No auth code in the link. Try signing in again.');
        return;
      }
      const { error } = await exchangeCode(params.code);
      if (error) {
        setStage('error');
        setMessage(error.message);
        return;
      }
      setStage('ok');
      router.replace('/profile');
    })();
  }, [params.code, params.error]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.center}>
        {stage === 'exchanging' && (
          <>
            <ActivityIndicator color={T.primary} size="large" />
            <Text style={styles.text}>Finishing sign-in…</Text>
          </>
        )}
        {stage === 'error' && (
          <>
            <Text style={styles.errorIcon}>✕</Text>
            <Text style={styles.text}>{message}</Text>
            <Pressable style={styles.btn} onPress={() => router.replace('/sign-in')}>
              <Text style={styles.btnText}>Try again</Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: T.space.xl,
    gap: T.space.lg,
  },
  text: { color: T.text, fontSize: T.font.md, textAlign: 'center' },
  errorIcon: { fontSize: 48, color: T.danger },
  btn: {
    backgroundColor: T.primary,
    paddingVertical: T.space.md,
    paddingHorizontal: T.space.xl,
    borderRadius: T.radius.lg,
  },
  btnText: { color: T.bg, fontSize: T.font.md, fontWeight: '700' },
});
