import type { ClearWireSupabase, DamageType, ServiceType } from '@clearwire/supabase';

export interface SubmitReportPhoto {
  /** Local file URI of the photo — optional, used only for logging */
  uri?: string;
  /** Raw bytes of the photo, read from disk by the caller */
  bytes: ArrayBuffer;
  ext: 'jpg' | 'png';
}

export interface SubmitReportInput {
  supabase: ClearWireSupabase;
  damageType: DamageType;
  description?: string;
  /** 1-5 photos per report (overview, close-up, angles). */
  photos: SubmitReportPhoto[];
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  /** Stable device ID for anonymous rate limiting */
  deviceId: string;
  /** Mark as test submission */
  isTest?: boolean;
  /** Service provider affected by the damage (optional) */
  affectedCompany?: string;
  /** Which services are disrupted (internet, cable_tv, etc.) — multi-select */
  servicesAffected?: ServiceType[];
}

export interface SubmitReportResult {
  ok: true;
  reportId: string;
  photoUrls: string[];
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
    photos,
    latitude,
    longitude,
    accuracyMeters,
    deviceId,
    isTest = false,
    affectedCompany,
    servicesAffected,
  } = input;

  if (!photos?.length) {
    return { ok: false, error: 'at least one photo required', stage: 'upload' };
  }
  if (photos.length > 5) {
    return { ok: false, error: 'at most 5 photos per report', stage: 'upload' };
  }

  // Upload each photo to storage sequentially; collect public URLs.
  const photoUrls: string[] = [];
  const baseName = `${deviceId}/${Date.now()}`;

  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    const filename = `${baseName}_${i}.${p.ext}`;
    const contentType = `image/${p.ext === 'jpg' ? 'jpeg' : 'png'}`;

    console.log('[submitReport] uploading', {
      filename,
      byteLength: p.bytes.byteLength,
      uri: p.uri,
    });

    let uploadRes;
    try {
      uploadRes = await supabase.storage
        .from('report-photos')
        .upload(filename, p.bytes, { contentType, upsert: false });
    } catch (e: any) {
      console.log('[submitReport] upload threw', e?.message, e?.stack);
      return {
        ok: false,
        error: `upload threw: ${e?.message ?? String(e)}`,
        stage: 'upload',
      };
    }

    if (uploadRes.error) {
      return { ok: false, error: uploadRes.error.message, stage: 'upload' };
    }

    const { data: publicUrl } = supabase.storage
      .from('report-photos')
      .getPublicUrl(filename);
    photoUrls.push(publicUrl.publicUrl);
  }

  console.log('[submitReport] inserting via RPC', {
    damage_type: damageType,
    photo_count: photoUrls.length,
    is_test: isTest,
    lat: latitude,
    lng: longitude,
    company: affectedCompany,
    services: servicesAffected,
  });

  const insertRes = await supabase.rpc('insert_report', {
    p_damage_type: damageType,
    p_description: description ?? null,
    p_photo_urls: photoUrls,
    p_latitude: latitude,
    p_longitude: longitude,
    p_accuracy_meters: accuracyMeters ?? null,
    p_reporter_device_id: deviceId,
    p_is_test: isTest,
    p_affected_company: affectedCompany ?? null,
    p_services_affected: servicesAffected ?? null,
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
    photoUrls,
  };
}
