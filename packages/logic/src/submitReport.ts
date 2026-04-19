import type { ClearWireSupabase, DamageType } from '@clearwire/supabase';

export interface SubmitReportInput {
  supabase: ClearWireSupabase;
  damageType: DamageType;
  description?: string;
  /** Local file URI of the photo (e.g. file:///... on native) */
  photoUri: string;
  /** Raw bytes of the photo, read from disk by the caller */
  photoBytes: ArrayBuffer;
  photoExt: 'jpg' | 'png';
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  /** Stable device ID for anonymous rate limiting */
  deviceId: string;
  /** Mark as test submission */
  isTest?: boolean;
}

export interface SubmitReportResult {
  ok: true;
  reportId: string;
  photoUrl: string;
}

export interface SubmitReportError {
  ok: false;
  error: string;
  stage: 'upload' | 'insert' | 'auth';
}

export async function submitReport(
  input: SubmitReportInput
): Promise<SubmitReportResult | SubmitReportError> {
  const {
    supabase,
    damageType,
    description,
    photoUri,
    photoBytes,
    photoExt,
    latitude,
    longitude,
    accuracyMeters,
    deviceId,
    isTest = false,
  } = input;

  // 1. Upload the photo bytes directly to Supabase Storage.
  const filename = `${deviceId}/${Date.now()}.${photoExt}`;
  const contentType = `image/${photoExt === 'jpg' ? 'jpeg' : 'png'}`;

  console.log('[submitReport] uploading', {
    filename,
    byteLength: photoBytes.byteLength,
    photoUri,
  });

  let uploadRes;
  try {
    uploadRes = await supabase.storage
      .from('report-photos')
      .upload(filename, photoBytes, {
        contentType,
        upsert: false,
      });
  } catch (e: any) {
    console.log('[submitReport] upload threw', e?.message, e?.stack);
    return {
      ok: false,
      error: `upload threw: ${e?.message ?? String(e)}`,
      stage: 'upload',
    };
  }

  console.log('[submitReport] upload result', {
    hasError: !!uploadRes.error,
    errorMsg: uploadRes.error?.message,
    path: uploadRes.data?.path,
  });

  if (uploadRes.error) {
    return { ok: false, error: uploadRes.error.message, stage: 'upload' };
  }

  const { data: publicUrl } = supabase.storage
    .from('report-photos')
    .getPublicUrl(filename);

  console.log('[submitReport] inserting via RPC', {
    damage_type: damageType,
    is_test: isTest,
    lat: latitude,
    lng: longitude,
  });

  const insertRes = await supabase.rpc('insert_report', {
    p_damage_type: damageType,
    p_description: description ?? null,
    p_photo_url: publicUrl.publicUrl,
    p_latitude: latitude,
    p_longitude: longitude,
    p_accuracy_meters: accuracyMeters ?? null,
    p_reporter_device_id: deviceId,
    p_is_test: isTest,
  });

  console.log('[submitReport] insert result', {
    hasError: !!insertRes.error,
    errorMsg: insertRes.error?.message,
    errorDetails: insertRes.error?.details,
    errorHint: insertRes.error?.hint,
    errorCode: insertRes.error?.code,
    rowId: insertRes.data,
  });

  if (insertRes.error) {
    return { ok: false, error: insertRes.error.message, stage: 'insert' };
  }

  return {
    ok: true,
    reportId: insertRes.data as string,
    photoUrl: publicUrl.publicUrl,
  };
}
