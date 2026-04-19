import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { T } from '@clearwire/brand';
import { signInWithMagicLink } from '../lib/auth';

type Stage = 'form' | 'sending' | 'sent' | 'error';

export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [stage, setStage] = useState<Stage>('form');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function handleSend() {
    if (!emailValid) return;
    setStage('sending');
    setErrorMsg(null);
    const { error } = await signInWithMagicLink(email.trim());
    if (error) {
      setErrorMsg(error.message);
      setStage('error');
      return;
    }
    setStage('sent');
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.inner}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
            <Text style={styles.backBtnText}>← Back</Text>
          </Pressable>
        </View>

        <View style={styles.body}>
          <Text style={styles.title}>Sign in as a pro</Text>
          <Text style={styles.subtitle}>
            Pros get proximity push alerts when damage is reported nearby.
            Enter your email and we'll send a sign-in link.
          </Text>

          {stage === 'sent' ? (
            <View style={styles.sentCard}>
              <Text style={styles.sentTitle}>Check your email</Text>
              <Text style={styles.sentBody}>
                We sent a sign-in link to <Text style={styles.emailBold}>{email}</Text>.
                Tap it on this phone to finish signing in.
              </Text>
              <Pressable
                style={styles.secondaryBtn}
                onPress={() => {
                  setStage('form');
                  setEmail('');
                }}
              >
                <Text style={styles.secondaryBtnText}>Use a different email</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@company.com"
                placeholderTextColor={T.textDim}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                style={styles.input}
                editable={stage !== 'sending'}
              />

              {stage === 'error' && errorMsg && (
                <Text style={styles.errorText}>{errorMsg}</Text>
              )}

              <Pressable
                onPress={handleSend}
                disabled={!emailValid || stage === 'sending'}
                style={[
                  styles.primaryBtn,
                  (!emailValid || stage === 'sending') && styles.primaryBtnDisabled,
                ]}
              >
                {stage === 'sending' ? (
                  <ActivityIndicator color={T.bg} />
                ) : (
                  <Text style={styles.primaryBtnText}>Send magic link</Text>
                )}
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  inner: { flex: 1 },
  header: { paddingHorizontal: T.space.lg, paddingVertical: T.space.md },
  backBtn: { paddingVertical: T.space.xs },
  backBtnText: { color: T.primary, fontSize: T.font.md, fontWeight: '600' },
  body: {
    flex: 1,
    paddingHorizontal: T.space.lg,
    paddingTop: T.space.xl,
    gap: T.space.lg,
  },
  title: {
    color: T.text,
    fontSize: T.font.xxl,
    fontWeight: '700',
  },
  subtitle: {
    color: T.textMuted,
    fontSize: T.font.md,
    lineHeight: 22,
  },
  input: {
    backgroundColor: T.surface,
    borderColor: T.border,
    borderWidth: 1,
    borderRadius: T.radius.md,
    padding: T.space.md,
    color: T.text,
    fontSize: T.font.md,
  },
  errorText: { color: T.danger, fontSize: T.font.sm },
  primaryBtn: {
    backgroundColor: T.primary,
    paddingVertical: T.space.lg,
    borderRadius: T.radius.lg,
    alignItems: 'center',
  },
  primaryBtnDisabled: { opacity: 0.4 },
  primaryBtnText: { color: T.bg, fontSize: T.font.lg, fontWeight: '700' },
  sentCard: {
    backgroundColor: T.surface,
    borderColor: T.border,
    borderWidth: 1,
    borderRadius: T.radius.lg,
    padding: T.space.lg,
    gap: T.space.md,
  },
  sentTitle: {
    color: T.text,
    fontSize: T.font.xl,
    fontWeight: '700',
  },
  sentBody: {
    color: T.textMuted,
    fontSize: T.font.md,
    lineHeight: 22,
  },
  emailBold: { color: T.text, fontWeight: '700' },
  secondaryBtn: {
    backgroundColor: T.surfaceAlt,
    paddingVertical: T.space.md,
    borderRadius: T.radius.md,
    alignItems: 'center',
    marginTop: T.space.sm,
  },
  secondaryBtnText: { color: T.text, fontSize: T.font.md, fontWeight: '600' },
});
