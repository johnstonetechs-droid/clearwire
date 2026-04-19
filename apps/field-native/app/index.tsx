import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { T } from '@clearwire/brand';

export default function Home() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.hero}>
        <Text style={styles.logo}>ClearWire</Text>
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

        <Pressable style={styles.secondaryBtn} onPress={() => {}}>
          <Text style={styles.secondaryBtnText}>View nearby reports</Text>
          <Text style={styles.comingSoon}>coming soon</Text>
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
  logo: {
    fontSize: T.font.display,
    fontWeight: '700',
    color: T.primary,
    letterSpacing: -1,
  },
  tagline: {
    fontSize: T.font.lg,
    color: T.textMuted,
    marginTop: T.space.sm,
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
  secondaryBtnText: {
    color: T.text,
    fontSize: T.font.md,
    fontWeight: '600',
  },
  comingSoon: {
    color: T.textDim,
    fontSize: T.font.xs,
    marginTop: 2,
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