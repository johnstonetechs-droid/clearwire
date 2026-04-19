import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

export type PickedPhoto = {
  /** Local URI of the processed (resized/compressed) JPEG */
  uri: string;
  /** Decimal coordinates from the original photo's EXIF, if present */
  exifCoords: { lat: number; lng: number } | null;
};

const MANIP_OPTS = {
  resize: { width: 1600 },
  compress: 0.7,
  format: ImageManipulator.SaveFormat.JPEG as const,
};

export async function pickFromGallery(): Promise<PickedPhoto | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (perm.status !== 'granted') return null;

  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 1,
    exif: true,
  });
  if (res.canceled || !res.assets?.length) return null;

  const asset = res.assets[0];
  const processed = await ImageManipulator.manipulateAsync(
    asset.uri,
    [{ resize: MANIP_OPTS.resize }],
    { compress: MANIP_OPTS.compress, format: MANIP_OPTS.format }
  );

  return {
    uri: processed.uri,
    exifCoords: extractExifCoords(asset.exif),
  };
}

export async function takePhotoWithPicker(): Promise<PickedPhoto | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (perm.status !== 'granted') return null;

  const res = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 1,
    exif: true,
  });
  if (res.canceled || !res.assets?.length) return null;

  const asset = res.assets[0];
  const processed = await ImageManipulator.manipulateAsync(
    asset.uri,
    [{ resize: MANIP_OPTS.resize }],
    { compress: MANIP_OPTS.compress, format: MANIP_OPTS.format }
  );

  return {
    uri: processed.uri,
    exifCoords: extractExifCoords(asset.exif),
  };
}

// EXIF GPS can be stored two ways:
//   - Decimal degrees: GPSLatitude: 41.4993, GPSLongitude: -81.6944
//   - DMS tuple: GPSLatitude: [41, 29, 57.48], GPSLongitude: [81, 41, 39.84],
//     with GPSLatitudeRef: 'N' and GPSLongitudeRef: 'W' to sign them.
// Handle both.
function extractExifCoords(exif: Record<string, unknown> | null | undefined):
  | { lat: number; lng: number }
  | null {
  if (!exif) return null;
  const lat = dmsOrDecimal(exif.GPSLatitude, exif.GPSLatitudeRef as string | undefined);
  const lng = dmsOrDecimal(exif.GPSLongitude, exif.GPSLongitudeRef as string | undefined);
  if (lat == null || lng == null) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) < 1e-6 && Math.abs(lng) < 1e-6) return null; // 0,0 placeholder
  return { lat, lng };
}

function dmsOrDecimal(v: unknown, ref: string | undefined): number | null {
  if (typeof v === 'number') {
    if (ref === 'S' || ref === 'W') return -v;
    return v;
  }
  if (Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number')) {
    const [deg, min, sec] = v as [number, number, number];
    let decimal = deg + min / 60 + sec / 3600;
    if (ref === 'S' || ref === 'W') decimal = -decimal;
    return decimal;
  }
  return null;
}
