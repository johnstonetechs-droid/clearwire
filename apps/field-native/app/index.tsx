import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { T } from '@clearwire/brand';

import { Logo } from '../components/Logo';
import { useAuth } from '../lib/auth';

export default function Home() {
  const router = useRouter();
  const auth = useAuth();
  const signedIn = auth.state === 'signed-in';

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.hero}>
        <View style={styles.logoRow}>
          <Logo size={44} />
          <Text style={styles.logoText}>ClearWire</Text>
        </View>
        <Text style={styles.subBrand}>FIELD REPORTER</Text>
        <Text style={styles.tagline}>
          See damage? Tap, snap, submit.
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={() => router.push('/report')}
          style={({ pressed }) => [
            styles.primaryBtn,
            pressed && styles.primaryBtnPressed,
          ]}
        >
          <Text style={styles.primaryBtnText}>Report Damage</Text>
        </Pressable>

        <Pressable
          onPress={() => router.push('/map')}
          style={({ pressed }) => [
            styles.secondaryBtn,
            pressed && styles.secondaryBtnPressed,
          ]}
        >
          <Text style={styles.secondaryBtnText}>View nearby reports</Text>
        </Pressable>

        <Pressable
          onPress={() => router.push(signedIn ? '/profile' : '/sign-in')}
          style={({ pressed }) => [
            styles.tertiaryBtn,
            pressed && styles.tertiaryBtnPressed,
          ]}
        >
          <Text style={styles.tertiaryBtnText}>
            {signedIn ? 'My pro profile' : 'Sign in as a pro'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Submitting a report is anonymous and takes about 30 seconds.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: T.bg,
    padding: T.space.xl,
    justifyContent: 'space-between',
  },
  hero: {
    marginTop: T.space.xxl,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: T.space.md,
  },
  logoText: {
    fontSize: T.font.display,
    fontWeight: '700',
    color: T.text,
    letterSpacing: -1,
  },
  subBrand: {
    fontSize: T.font.xs,
    color: T.textDim,
    letterSpacing: 2,
    marginTop: T.space.sm,
    fontWeight: '600',
  },
  tagline: {
    fontSize: T.font.lg,
    color: T.textMuted,
    marginTop: T.space.md,
  },
  actions: {
    gap: T.space.md,
  },
  primaryBtn: {
    backgroundColor: T.primary,
    paddingVertical: T.space.lg + 4,
    borderRadius: T.radius.lg,
    alignItems: 'center',
  },
  primaryBtnPressed: {
    backgroundColor: T.primaryDark,
  },
  primaryBtnText: {
    color: T.bg,
    fontSize: T.font.lg,
    fontWeight: '700',
  },
  secondaryBtn: {
    backgroundColor: T.surface,
    paddingVertical: T.space.lg,
    borderRadius: T.radius.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: T.border,
  },
  secondaryBtnPressed: {
    backgroundColor: T.surfaceAlt,
  },
  secondaryBtnText: {
    color: T.text,
    fontSize: T.font.md,
    fontWeight: '600',
  },
  tertiaryBtn: {
    paddingVertical: T.space.md,
    alignItems: 'center',
    borderRadius: T.radius.md,
  },
  tertiaryBtnPressed: {
    backgroundColor: T.surface,
  },
  tertiaryBtnText: {
    color: T.primary,
    fontSize: T.font.sm,
    fontWeight: '600',
  },
  footer: {
    paddingBottom: T.space.lg,
  },
  footerText: {
    color: T.textDim,
    fontSize: T.font.sm,
    textAlign: 'center',
  },
});