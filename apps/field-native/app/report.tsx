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
  type ServiceType,
  DAMAGE_TYPE_LABELS,
  DAMAGE_TYPE_ICONS,
  SERVICE_TYPE_LABELS,
  SERVICE_TYPE_ICONS,
  SERVICE_TYPE_COLORS,
} from '@clearwire/supabase';
import { submitReport, type SubmitReportPhoto } from '@clearwire/logic';

import { supabase } from '../lib/supabase';
import { getDeviceId } from '../lib/deviceId';
import { DamageIcon } from '../components/DamageIcon';
import { pickFromGallery, takePhotoWithPicker, type PickedPhoto } from '../lib/photoPicker';
import { ChangeLocationSheet, type LocationChoice } from '../components/ChangeLocationSheet';
import { useToggleSet } from '../lib/useToggleSet';

type Stage = 'capture' | 'classify' | 'submitting' | 'done';
type LocationSource = 'gps' | 'exif' | 'address' | 'map';

type CustomLocation = {
  lat: number;
  lng: number;
  accuracy: number | null;
  label?: string;
};

const MAX_PHOTOS = 5;

export default function Report() {
  const router = useRouter();
  const cameraRef = useRef<CameraView>(null);
  const [camPerm, requestCamPerm] = useCameraPermissions();

  const [stage, setStage] = useState<Stage>('capture');
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [damageType, setDamageType] = useState<DamageType | null>(null);
  const servicesAffected = useToggleSet<ServiceType>();
  const [description, setDescription] = useState('');
  const [affectedCompany, setAffectedCompany] = useState('');
  const [gpsLocation, setGpsLocation] = useState<{
    lat: number;
    lng: number;
    accuracy: number | null;
  } | null>(null);
  const [locationSource, setLocationSource] = useState<LocationSource>('gps');
  const [customLocation, setCustomLocation] = useState<CustomLocation | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationSheetOpen, setLocationSheetOpen] = useState(false);

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
        setGpsLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      } catch (e: any) {
        setLocationError(e?.message ?? 'Could not get location');
      }
    })();
  }, []);

  // Final location sent with the report. Priority:
  //   custom (address/map) → EXIF → GPS.
  const effectiveLocation = ((): CustomLocation | null => {
    if ((locationSource === 'address' || locationSource === 'map') && customLocation) {
      return customLocation;
    }
    if (locationSource === 'exif' && photos[0]?.exifCoords) {
      return {
        lat: photos[0].exifCoords.lat,
        lng: photos[0].exifCoords.lng,
        accuracy: null,
      };
    }
    return gpsLocation;
  })();

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
      addPhoto({ uri: processed.uri, exifCoords: null });
    } catch (e: any) {
      Alert.alert('Camera error', e?.message ?? String(e));
    }
  }

  async function handlePickGallery() {
    const picked = await pickFromGallery();
    if (!picked) return;
    addPhoto(picked);
  }

  async function handlePickAnotherCamera() {
    const picked = await takePhotoWithPicker();
    if (!picked) return;
    addPhoto(picked);
  }

  function addPhoto(p: PickedPhoto) {
    setPhotos((prev) => {
      const next = [...prev, p];
      // First photo with EXIF coords → use those as the report location.
      if (prev.length === 0 && p.exifCoords) {
        setLocationSource('exif');
      }
      return next;
    });
    setStage('classify');
  }

  function handleRemovePhoto(index: number) {
    setPhotos((prev) => {
      const next = prev.filter((_, i) => i !== index);
      // If we removed the first photo and it had EXIF, fall back to GPS.
      if (index === 0 && next[0]?.exifCoords == null) {
        setLocationSource('gps');
      }
      return next;
    });
  }

  function handleAddAnother() {
    Alert.alert('Add another photo', undefined, [
      { text: 'Camera', onPress: handlePickAnotherCamera },
      { text: 'Gallery', onPress: handlePickGallery },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function handleSubmit() {
    if (!photos.length || !damageType) return;
    if (!effectiveLocation) {
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
      const photoPayloads: SubmitReportPhoto[] = [];
      for (const p of photos) {
        const base64 = await FileSystem.readAsStringAsync(p.uri, {
          encoding: 'base64',
        });
        photoPayloads.push({
          uri: p.uri,
          bytes: base64ToArrayBuffer(base64),
          ext: 'jpg',
        });
      }

      const services = Array.from(servicesAffected.values);
      const result = await submitReport({
        supabase,
        damageType,
        description: description.trim() || undefined,
        photos: photoPayloads,
        latitude: effectiveLocation.lat,
        longitude: effectiveLocation.lng,
        accuracyMeters: effectiveLocation.accuracy ?? undefined,
        deviceId,
        affectedCompany: affectedCompany.trim() || undefined,
        servicesAffected: services.length > 0 ? services : undefined,
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
                  backgroundColor: gpsLocation
                    ? T.success
                    : locationError
                    ? T.danger
                    : T.warning,
                },
              ]}
            />
            <Text style={styles.locationText}>
              {gpsLocation
                ? `GPS ready · ±${Math.round(gpsLocation.accuracy ?? 0)}m`
                : locationError
                ? 'GPS error'
                : 'Getting GPS fix…'}
            </Text>
          </View>
          <View style={styles.cameraActions}>
            <Pressable onPress={handlePickGallery} style={styles.galleryBtn} hitSlop={8}>
              <Text style={styles.galleryBtnText}>Gallery</Text>
            </Pressable>
            <Pressable style={styles.shutter} onPress={handleCapture}>
              <View style={styles.shutterInner} />
            </Pressable>
            <View style={styles.galleryBtn} />
          </View>
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
      <Text style={styles.label}>
        Photos ({photos.length}/{MAX_PHOTOS})
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.photoStrip}
      >
        {photos.map((p, i) => (
          <View key={`${p.uri}-${i}`} style={styles.photoThumbWrap}>
            <Image source={{ uri: p.uri }} style={styles.photoThumb} />
            <Pressable
              onPress={() => handleRemovePhoto(i)}
              style={styles.photoRemoveBtn}
              hitSlop={8}
            >
              <Text style={styles.photoRemoveText}>✕</Text>
            </Pressable>
          </View>
        ))}
        {photos.length < MAX_PHOTOS && (
          <Pressable onPress={handleAddAnother} style={styles.addPhotoBtn}>
            <Text style={styles.addPhotoPlus}>+</Text>
            <Text style={styles.addPhotoLabel}>Add</Text>
          </Pressable>
        )}
      </ScrollView>

      <Text style={styles.label}>What kind of damage?</Text>
      <View style={styles.damageGrid}>
        {(Object.keys(DAMAGE_TYPE_LABELS) as DamageType[]).map((type) => {
          const active = damageType === type;
          return (
            <Pressable
              key={type}
              onPress={() => setDamageType(type)}
              style={[styles.damageChip, active && styles.damageChipActive]}
            >
              <DamageIcon
                name={DAMAGE_TYPE_ICONS[type]}
                size={16}
                color={active ? T.bg : T.text}
              />
              <Text
                style={[
                  styles.damageChipText,
                  active && styles.damageChipTextActive,
                ]}
              >
                {DAMAGE_TYPE_LABELS[type]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>Services affected (optional)</Text>
      <View style={styles.damageGrid}>
        {(Object.keys(SERVICE_TYPE_LABELS) as ServiceType[]).map((type) => {
          const active = servicesAffected.has(type);
          return (
            <Pressable
              key={type}
              onPress={() => servicesAffected.toggle(type)}
              style={[
                styles.damageChip,
                active && {
                  backgroundColor: SERVICE_TYPE_COLORS[type],
                  borderColor: SERVICE_TYPE_COLORS[type],
                },
              ]}
            >
              <DamageIcon
                name={SERVICE_TYPE_ICONS[type]}
                size={16}
                color={active ? '#fff' : T.text}
              />
              <Text
                style={[
                  styles.damageChipText,
                  active && { color: '#fff' },
                ]}
              >
                {SERVICE_TYPE_LABELS[type]}
              </Text>
            </Pressable>
          );
        })}
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

      <Text style={styles.label}>Affected company (optional)</Text>
      <TextInput
        value={affectedCompany}
        onChangeText={setAffectedCompany}
        placeholder="e.g. Spectrum, AT&T, FirstEnergy"
        placeholderTextColor={T.textDim}
        style={[styles.input, { minHeight: 44 }]}
        autoCapitalize="words"
        maxLength={80}
      />

      <View style={styles.locationRow}>
        <Text style={styles.locationRowLabel}>{locationLabel(locationSource)}</Text>
        <Text style={styles.locationRowText}>
          {effectiveLocation
            ? `${effectiveLocation.lat.toFixed(5)}, ${effectiveLocation.lng.toFixed(5)}`
            : locationError ?? 'Getting location…'}
        </Text>
        {customLocation?.label && locationSource === 'address' && (
          <Text style={styles.locationSubtext} numberOfLines={2}>
            {customLocation.label}
          </Text>
        )}
        <Pressable
          onPress={() => setLocationSheetOpen(true)}
          style={styles.locationSwapBtn}
        >
          <Text style={styles.locationSwapText}>Change location…</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={handleSubmit}
        disabled={!damageType || !photos.length || stage === 'submitting'}
        style={[
          styles.primaryBtn,
          (!damageType || !photos.length || stage === 'submitting') &&
            styles.primaryBtnDisabled,
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
          setPhotos([]);
          setDamageType(null);
          setDescription('');
          setAffectedCompany('');
          setLocationSource('gps');
          setCustomLocation(null);
          setStage('capture');
        }}
        style={styles.retakeBtn}
      >
        <Text style={styles.retakeText}>Start over</Text>
      </Pressable>

      <ChangeLocationSheet
        visible={locationSheetOpen}
        currentLocation={effectiveLocation}
        hasExifOption={!!photos[0]?.exifCoords}
        onCancel={() => setLocationSheetOpen(false)}
        onPick={(choice: LocationChoice) => {
          setLocationSheetOpen(false);
          setLocationSource(choice.source);
          if (choice.source === 'address' || choice.source === 'map') {
            setCustomLocation({
              lat: choice.lat,
              lng: choice.lng,
              accuracy: null,
              label: choice.label,
            });
          } else if (choice.source === 'gps') {
            setGpsLocation({
              lat: choice.lat,
              lng: choice.lng,
              accuracy: choice.accuracy,
            });
            setCustomLocation(null);
          } else {
            setCustomLocation(null);
          }
        }}
        onRequestExif={() => {
          setLocationSheetOpen(false);
          setLocationSource('exif');
          setCustomLocation(null);
        }}
      />
    </ScrollView>
  );
}

function locationLabel(source: LocationSource): string {
  switch (source) {
    case 'exif':
      return '📍 From photo';
    case 'address':
      return '📍 From address';
    case 'map':
      return '📍 Picked on map';
    case 'gps':
    default:
      return '📍 Current location';
  }
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
  bodyText: { color: T.text, fontSize: T.font.md, textAlign: 'center' },
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
  cameraActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: T.space.xl,
  },
  galleryBtn: {
    minWidth: 64,
    paddingVertical: T.space.sm,
    alignItems: 'center',
  },
  galleryBtnText: {
    color: '#fff',
    fontSize: T.font.sm,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: T.space.md,
    paddingVertical: T.space.sm,
    borderRadius: T.radius.pill,
    overflow: 'hidden',
  },
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
  label: { color: T.text, fontSize: T.font.md, fontWeight: '600' },
  photoStrip: { gap: T.space.sm, paddingRight: T.space.lg },
  photoThumbWrap: {
    position: 'relative',
    width: 120,
    aspectRatio: 4 / 3,
  },
  photoThumb: {
    width: '100%',
    height: '100%',
    borderRadius: T.radius.md,
    backgroundColor: T.surface,
  },
  photoRemoveBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRemoveText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  addPhotoBtn: {
    width: 120,
    aspectRatio: 4 / 3,
    borderRadius: T.radius.md,
    borderWidth: 1,
    borderColor: T.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.surface,
  },
  addPhotoPlus: { color: T.primary, fontSize: 32, fontWeight: '300' },
  addPhotoLabel: { color: T.textMuted, fontSize: T.font.sm },
  damageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: T.space.sm },
  damageChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: T.space.xs + 2,
    paddingHorizontal: T.space.md,
    paddingVertical: T.space.sm + 2,
    borderRadius: T.radius.pill,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
  },
  damageChipActive: { backgroundColor: T.primary, borderColor: T.primary },
  damageChipText: { color: T.text, fontSize: T.font.sm, fontWeight: '500' },
  damageChipTextActive: { color: T.bg, fontWeight: '700' },
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
    gap: 2,
  },
  locationRowLabel: { color: T.text, fontSize: T.font.sm, fontWeight: '600' },
  locationRowText: { color: T.textMuted, fontSize: T.font.sm },
  locationSubtext: { color: T.textDim, fontSize: T.font.xs, marginTop: 2 },
  locationSwapBtn: { marginTop: T.space.sm },
  locationSwapText: {
    color: T.primary,
    fontSize: T.font.sm,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  primaryBtn: {
    backgroundColor: T.primary,
    paddingVertical: T.space.lg,
    borderRadius: T.radius.lg,
    alignItems: 'center',
  },
  primaryBtnDisabled: { opacity: 0.4 },
  primaryBtnText: { color: T.bg, fontSize: T.font.lg, fontWeight: '700' },
  retakeBtn: { alignItems: 'center', paddingVertical: T.space.md },
  retakeText: { color: T.textMuted, fontSize: T.font.sm },
  successIcon: { fontSize: 64, color: T.success },
  successTitle: { color: T.text, fontSize: T.font.xxl, fontWeight: '700' },
});
