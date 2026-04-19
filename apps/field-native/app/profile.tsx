import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';

import { T } from '@clearwire/brand';
import type { ProRole } from '@clearwire/supabase';

import { supabase } from '../lib/supabase';
import { useAuth, signOut } from '../lib/auth';
import {
  registerForPushNotificationsAsync,
  sendTestPush,
} from '../lib/pushNotifications';

const ROLES: { value: ProRole; label: string }[] = [
  { value: 'contractor', label: 'Contractor' },
  { value: 'building_manager', label: 'Building manager' },
  { value: 'clearwire_crew', label: 'ClearWire crew' },
  { value: 'municipality', label: 'Municipality' },
];

type Profile = {
  display_name: string | null;
  company: string | null;
  role: ProRole | null;
  alert_radius_miles: number;
  last_location_update: string | null;
  expo_push_token: string | null;
};

export default function ProfileScreen() {
  const router = useRouter();
  const auth = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingLocation, setUpdatingLocation] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState<ProRole | null>(null);
  const [alertRadius, setAlertRadius] = useState(5);
  const [lastLocationUpdate, setLastLocationUpdate] = useState<string | null>(null);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [enablingAlerts, setEnablingAlerts] = useState(false);
  const [testingPush, setTestingPush] = useState(false);

  useEffect(() => {
    if (auth.state === 'signed-out') {
      router.replace('/sign-in');
    }
  }, [auth.state]);

  useEffect(() => {
    if (auth.state !== 'signed-in') return;
    (async () => {
      const { data, error } = await supabase
        .from('pro_profiles')
        .select(
          'display_name, company, role, alert_radius_miles, last_location_update, expo_push_token'
        )
        .eq('id', auth.user.id)
        .maybeSingle();

      if (!error && data) {
        const p = data as Profile;
        setDisplayName(p.display_name ?? '');
        setCompany(p.company ?? '');
        setRole(p.role);
        setAlertRadius(Number(p.alert_radius_miles ?? 5));
        setLastLocationUpdate(p.last_location_update);
        setPushToken(p.expo_push_token);
      }
      setLoading(false);
    })();
  }, [auth.state]);

  async function handleSave() {
    if (auth.state !== 'signed-in') return;
    setSaving(true);
    const { error } = await supabase.from('pro_profiles').upsert(
      {
        id: auth.user.id,
        display_name: displayName.trim() || null,
        company: company.trim() || null,
        role,
        alert_radius_miles: alertRadius,
      },
      { onConflict: 'id' }
    );
    setSaving(false);
    if (error) {
      Alert.alert('Save failed', error.message);
      return;
    }
    Alert.alert('Saved', 'Your profile is up to date.');
  }

  async function handleUpdateLocation() {
    if (auth.state !== 'signed-in') return;
    setUpdatingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location denied', 'Grant location access to receive proximity alerts.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { error } = await supabase.rpc('update_pro_location', {
        p_latitude: pos.coords.latitude,
        p_longitude: pos.coords.longitude,
      });
      if (error) {
        Alert.alert('Update failed', error.message);
        return;
      }
      setLastLocationUpdate(new Date().toISOString());
      Alert.alert('Location updated', 'Proximity alerts will use this as your base.');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? String(e));
    } finally {
      setUpdatingLocation(false);
    }
  }

  async function handleEnableAlerts() {
    if (auth.state !== 'signed-in') return;
    setEnablingAlerts(true);
    const result = await registerForPushNotificationsAsync();
    if (!result.ok) {
      setEnablingAlerts(false);
      Alert.alert('Could not enable alerts', result.reason);
      return;
    }
    const { error } = await supabase.from('pro_profiles').upsert(
      { id: auth.user.id, expo_push_token: result.token },
      { onConflict: 'id' }
    );
    setEnablingAlerts(false);
    if (error) {
      Alert.alert('Save failed', error.message);
      return;
    }
    setPushToken(result.token);
  }

  async function handleDisableAlerts() {
    if (auth.state !== 'signed-in') return;
    const { error } = await supabase
      .from('pro_profiles')
      .update({ expo_push_token: null })
      .eq('id', auth.user.id);
    if (error) {
      Alert.alert('Update failed', error.message);
      return;
    }
    setPushToken(null);
  }

  async function handleTestPush() {
    if (!pushToken) return;
    setTestingPush(true);
    const err = await sendTestPush(pushToken, 'Proximity alerts are working.');
    setTestingPush(false);
    if (err) {
      Alert.alert('Test failed', err);
    } else {
      Alert.alert(
        'Test sent',
        'The push is on its way — watch for it in the next few seconds. ' +
          'If the app is foregrounded, you should see a banner.'
      );
    }
  }

  async function handleSignOut() {
    await signOut();
    router.replace('/');
  }

  if (auth.state === 'loading' || loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator color={T.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (auth.state !== 'signed-in') {
    return null;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Text style={styles.backBtnText}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Pro profile</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.emailRow}>
          <Text style={styles.emailLabel}>Signed in as</Text>
          <Text style={styles.emailValue}>{auth.user.email}</Text>
        </View>

        <Field label="Display name">
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Jane Q."
            placeholderTextColor={T.textDim}
            style={styles.input}
          />
        </Field>

        <Field label="Company">
          <TextInput
            value={company}
            onChangeText={setCompany}
            placeholder="Acme Telecom"
            placeholderTextColor={T.textDim}
            style={styles.input}
          />
        </Field>

        <Field label="Role">
          <View style={styles.roleGrid}>
            {ROLES.map((r) => (
              <Pressable
                key={r.value}
                onPress={() => setRole(r.value)}
                style={[
                  styles.roleChip,
                  role === r.value && styles.roleChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.roleChipText,
                    role === r.value && styles.roleChipTextActive,
                  ]}
                >
                  {r.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Field>

        <Field label={`Alert radius: ${alertRadius} mi`}>
          <View style={styles.radiusRow}>
            {[1, 2, 5, 10, 25].map((r) => (
              <Pressable
                key={r}
                onPress={() => setAlertRadius(r)}
                style={[
                  styles.radiusChip,
                  alertRadius === r && styles.radiusChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.radiusChipText,
                    alertRadius === r && styles.radiusChipTextActive,
                  ]}
                >
                  {r} mi
                </Text>
              </Pressable>
            ))}
          </View>
        </Field>

        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={[styles.primaryBtn, saving && styles.primaryBtnDisabled]}
        >
          {saving ? (
            <ActivityIndicator color={T.bg} />
          ) : (
            <Text style={styles.primaryBtnText}>Save profile</Text>
          )}
        </Pressable>

        <View style={styles.divider} />

        <Text style={styles.sectionLabel}>Proximity base</Text>
        <Text style={styles.sectionHelp}>
          Alerts fire when a report is within {alertRadius} mi of this point.
          {lastLocationUpdate
            ? ` Last updated ${formatRelative(lastLocationUpdate)}.`
            : ' Not set yet.'}
        </Text>
        <Pressable
          onPress={handleUpdateLocation}
          disabled={updatingLocation}
          style={[styles.secondaryBtn, updatingLocation && styles.primaryBtnDisabled]}
        >
          {updatingLocation ? (
            <ActivityIndicator color={T.text} />
          ) : (
            <Text style={styles.secondaryBtnText}>Update my location now</Text>
          )}
        </Pressable>

        <View style={styles.divider} />

        <Text style={styles.sectionLabel}>Proximity alerts</Text>
        {pushToken ? (
          <>
            <View style={styles.alertStatus}>
              <View style={styles.alertDot} />
              <Text style={styles.alertStatusText}>Alerts enabled on this device</Text>
            </View>
            <Pressable
              onPress={handleTestPush}
              disabled={testingPush}
              style={[styles.secondaryBtn, testingPush && styles.primaryBtnDisabled]}
            >
              {testingPush ? (
                <ActivityIndicator color={T.text} />
              ) : (
                <Text style={styles.secondaryBtnText}>Send test push</Text>
              )}
            </Pressable>
            <Pressable onPress={handleDisableAlerts} style={styles.linkBtn}>
              <Text style={styles.linkBtnText}>Disable alerts on this device</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.sectionHelp}>
              Get a push notification when a report is within {alertRadius} mi of your last
              known location.
            </Text>
            <Pressable
              onPress={handleEnableAlerts}
              disabled={enablingAlerts}
              style={[styles.primaryBtn, enablingAlerts && styles.primaryBtnDisabled]}
            >
              {enablingAlerts ? (
                <ActivityIndicator color={T.bg} />
              ) : (
                <Text style={styles.primaryBtnText}>Enable proximity alerts</Text>
              )}
            </Pressable>
          </>
        )}

        <View style={styles.divider} />

        <Pressable onPress={handleSignOut} style={styles.signOutBtn}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function formatRelative(iso: string): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return 'just now';
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: T.space.lg,
    paddingVertical: T.space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: T.border,
  },
  backBtn: { paddingVertical: T.space.xs, minWidth: 60 },
  backBtnText: { color: T.primary, fontSize: T.font.md, fontWeight: '600' },
  title: { color: T.text, fontSize: T.font.md, fontWeight: '700' },
  content: { padding: T.space.lg, gap: T.space.lg, paddingBottom: T.space.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emailRow: {
    backgroundColor: T.surface,
    borderColor: T.border,
    borderWidth: 1,
    borderRadius: T.radius.md,
    padding: T.space.md,
    gap: 2,
  },
  emailLabel: { color: T.textDim, fontSize: T.font.xs },
  emailValue: { color: T.text, fontSize: T.font.md, fontWeight: '600' },
  field: { gap: T.space.sm },
  fieldLabel: { color: T.text, fontSize: T.font.md, fontWeight: '600' },
  input: {
    backgroundColor: T.surface,
    borderColor: T.border,
    borderWidth: 1,
    borderRadius: T.radius.md,
    padding: T.space.md,
    color: T.text,
    fontSize: T.font.md,
  },
  roleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: T.space.sm },
  roleChip: {
    paddingHorizontal: T.space.md,
    paddingVertical: T.space.sm + 2,
    borderRadius: T.radius.pill,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
  },
  roleChipActive: { backgroundColor: T.primary, borderColor: T.primary },
  roleChipText: { color: T.text, fontSize: T.font.sm, fontWeight: '500' },
  roleChipTextActive: { color: T.bg, fontWeight: '700' },
  radiusRow: { flexDirection: 'row', gap: T.space.sm },
  radiusChip: {
    flex: 1,
    paddingVertical: T.space.sm + 2,
    borderRadius: T.radius.md,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
    alignItems: 'center',
  },
  radiusChipActive: { backgroundColor: T.primary, borderColor: T.primary },
  radiusChipText: { color: T.text, fontSize: T.font.sm, fontWeight: '500' },
  radiusChipTextActive: { color: T.bg, fontWeight: '700' },
  primaryBtn: {
    backgroundColor: T.primary,
    paddingVertical: T.space.lg,
    borderRadius: T.radius.lg,
    alignItems: 'center',
  },
  primaryBtnDisabled: { opacity: 0.4 },
  primaryBtnText: { color: T.bg, fontSize: T.font.lg, fontWeight: '700' },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: T.border,
    marginVertical: T.space.sm,
  },
  sectionLabel: { color: T.text, fontSize: T.font.md, fontWeight: '600' },
  sectionHelp: { color: T.textMuted, fontSize: T.font.sm, lineHeight: 20 },
  secondaryBtn: {
    backgroundColor: T.surface,
    paddingVertical: T.space.md,
    borderRadius: T.radius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: T.border,
  },
  secondaryBtnText: { color: T.text, fontSize: T.font.md, fontWeight: '600' },
  signOutBtn: { alignItems: 'center', paddingVertical: T.space.md },
  signOutText: { color: T.danger, fontSize: T.font.md, fontWeight: '600' },
  alertStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: T.space.sm,
    backgroundColor: T.surface,
    padding: T.space.md,
    borderRadius: T.radius.md,
    borderWidth: 1,
    borderColor: T.border,
  },
  alertDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: T.success,
  },
  alertStatusText: { color: T.text, fontSize: T.font.sm },
  linkBtn: { alignItems: 'center', paddingVertical: T.space.sm },
  linkBtnText: { color: T.textMuted, fontSize: T.font.sm },
});
