import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';

import { T } from '@clearwire/brand';
import {
  type DamageType,
  DAMAGE_TYPE_LABELS,
} from '@clearwire/supabase';
import { submitReport } from '@clearwire/logic';

import { supabase } from '../lib/supabase';
import { getDeviceId } from '../lib/deviceId';

type Stage = 'capture' | 'classify' | 'submitting' | 'done';

export default function Report() {
  const router = useRouter();
  const cameraRef = useRef<CameraView>(null);
  const [camPerm, requestCamPerm] = useCameraPermissions();

  const [stage, setStage] = useState<Stage>('capture');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [damageType, setDamageType] = useState<DamageType | null>(null);
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState<{
    lat: number;
    lng: number;
    accuracy: number | null;
  } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError('Location permission denied. Reports need GPS.');
        return;
      }
      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      } catch (e: any) {
        setLocationError(e?.message ?? 'Could not get location');
      }
    })();
  }, []);

  async function handleCapture() {
    if (!cameraRef.current) return;
    try {
      const shot = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: false,
      });
      if (!shot) return;

      const processed = await ImageManipulator.manipulateAsync(
        shot.uri,
        [{ resize: { width: 1600 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
      );

      setPhotoUri(processed.uri);
      setStage('classify');
    } catch (e: any) {
      Alert.alert('Camera error', e?.message ?? String(e));
    }
  }

  async function handleSubmit() {
    if (!photoUri || !damageType) return;
    if (!location) {
      Alert.alert(
        'No location yet',
        locationError ??
          'Still getting GPS fix — please wait a moment and try again.'
      );
      return;
    }

    setStage('submitting');
    try {
      const deviceId = await getDeviceId();

      // Read photo bytes from disk. RN's fetch/Blob is unreliable for
      // local file URIs; FileSystem returns base64 we convert to bytes.
      const base64 = await FileSystem.readAsStringAsync(photoUri, {
        encoding: 'base64',
      });
      const photoBytes = base64ToArrayBuffer(base64);
      const result = await submitReport({
        supabase,
        damageType,
        description: description.trim() || undefined,
        photoUri,
        photoBytes,
        photoExt: 'jpg',
        latitude: location.lat,
        longitude: location.lng,
        accuracyMeters: location.accuracy ?? undefined,
        deviceId,
        isTest: true, // TODO: Remove when going to production
      });

      if (!result.ok) {
        setStage('classify');
        Alert.alert('Submit failed', `${result.stage}: ${result.error}`);
        return;
      }

      setStage('done');
    } catch (e: any) {
      setStage('classify');
      Alert.alert('Unexpected error', e?.message ?? String(e));
    }
  }

  if (!camPerm) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={T.primary} />
      </View>
    );
  }
  if (!camPerm.granted) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.bodyText}>
          ClearWire needs camera access to submit reports.
        </Text>
        <Pressable style={styles.primaryBtn} onPress={requestCamPerm}>
          <Text style={styles.primaryBtnText}>Grant camera access</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (stage === 'capture') {
    return (
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back" />
        <SafeAreaView style={styles.cameraOverlay} edges={['bottom']}>
          <View style={styles.locationBadge}>
            <View
              style={[
                styles.locationDot,
                {
                  backgroundColor: location
                    ? T.success
                    : locationError
                    ? T.danger
                    : T.warning,
                },
              ]}
            />
            <Text style={styles.locationText}>
              {location
                ? `GPS ready · ±${Math.round(location.accuracy ?? 0)}m`
                : locationError
                ? 'GPS error'
                : 'Getting GPS fix…'}
            </Text>
          </View>
          <Pressable style={styles.shutter} onPress={handleCapture}>
            <View style={styles.shutterInner} />
          </Pressable>
        </SafeAreaView>
      </View>
    );
  }

  if (stage === 'done') {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.successIcon}>✓</Text>
        <Text style={styles.successTitle}>Report submitted</Text>
        <Text style={styles.bodyText}>Thanks — crews have been notified.</Text>
        <Pressable style={styles.primaryBtn} onPress={() => router.replace('/')}>
          <Text style={styles.primaryBtnText}>Done</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <ScrollView
      style={styles.classifyContainer}
      contentContainerStyle={styles.classifyContent}
    >
      {photoUri && <Image source={{ uri: photoUri }} style={styles.preview} />}

      <Text style={styles.label}>What kind of damage?</Text>
      <View style={styles.damageGrid}>
        {(Object.keys(DAMAGE_TYPE_LABELS) as DamageType[]).map((type) => (
          <Pressable
            key={type}
            onPress={() => setDamageType(type)}
            style={[
              styles.damageChip,
              damageType === type && styles.damageChipActive,
            ]}
          >
            <Text
              style={[
                styles.damageChipText,
                damageType === type && styles.damageChipTextActive,
              ]}
            >
              {DAMAGE_TYPE_LABELS[type]}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Description (optional)</Text>
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder="e.g. wire hanging low over driveway"
        placeholderTextColor={T.textDim}
        style={styles.input}
        multiline
        maxLength={280}
      />

      <View style={styles.locationRow}>
        <Text style={styles.locationRowText}>
          {location
            ? `📍 ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`
            : locationError ?? 'Getting location…'}
        </Text>
      </View>

      <Pressable
        onPress={handleSubmit}
        disabled={!damageType || stage === 'submitting'}
        style={[
          styles.primaryBtn,
          (!damageType || stage === 'submitting') && styles.primaryBtnDisabled,
        ]}
      >
        {stage === 'submitting' ? (
          <ActivityIndicator color={T.bg} />
        ) : (
          <Text style={styles.primaryBtnText}>Submit report</Text>
        )}
      </Pressable>

      <Pressable
        onPress={() => {
          setPhotoUri(null);
          setDamageType(null);
          setDescription('');
          setStage('capture');
        }}
        style={styles.retakeBtn}
      >
        <Text style={styles.retakeText}>Retake photo</Text>
      </Pressable>
    </ScrollView>
  );
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = globalThis.atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: T.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: T.space.xl,
    gap: T.space.lg,
  },
  bodyText: {
    color: T.text,
    fontSize: T.font.md,
    textAlign: 'center',
  },
  cameraContainer: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  cameraOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingBottom: T.space.xl,
    gap: T.space.lg,
  },
  locationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: T.space.sm,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: T.space.md,
    paddingVertical: T.space.sm,
    borderRadius: T.radius.pill,
  },
  locationDot: { width: 8, height: 8, borderRadius: 4 },
  locationText: { color: '#fff', fontSize: T.font.sm },
  shutter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
  },

  classifyContainer: { flex: 1, backgroundColor: T.bg },
  classifyContent: { padding: T.space.lg, gap: T.space.lg },
  preview: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: T.radius.lg,
    backgroundColor: T.surface,
  },
  label: {
    color: T.text,
    fontSize: T.font.md,
    fontWeight: '600',
  },
  damageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: T.space.sm,
  },
  damageChip: {
    paddingHorizontal: T.space.md,
    paddingVertical: T.space.sm + 2,
    borderRadius: T.radius.pill,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
  },
  damageChipActive: {
    backgroundColor: T.primary,
    borderColor: T.primary,
  },
  damageChipText: {
    color: T.text,
    fontSize: T.font.sm,
    fontWeight: '500',
  },
  damageChipTextActive: {
    color: T.bg,
    fontWeight: '700',
  },
  input: {
    backgroundColor: T.surface,
    borderColor: T.border,
    borderWidth: 1,
    borderRadius: T.radius.md,
    padding: T.space.md,
    color: T.text,
    fontSize: T.font.md,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  locationRow: {
    backgroundColor: T.surfaceAlt,
    padding: T.space.md,
    borderRadius: T.radius.md,
  },
  locationRowText: {
    color: T.textMuted,
    fontSize: T.font.sm,
  },
  primaryBtn: {
    backgroundColor: T.primary,
    paddingVertical: T.space.lg,
    borderRadius: T.radius.lg,
    alignItems: 'center',
  },
  primaryBtnDisabled: { opacity: 0.4 },
  primaryBtnText: {
    color: T.bg,
    fontSize: T.font.lg,
    fontWeight: '700',
  },
  retakeBtn: { alignItems: 'center', paddingVertical: T.space.md },
  retakeText: { color: T.textMuted, fontSize: T.font.sm },
  successIcon: {
    fontSize: 64,
    color: T.success,
  },
  successTitle: {
    color: T.text,
    fontSize: T.font.xxl,
    fontWeight: '700',
  },
});