/**
 * Hand-written domain types. After running the schema migration,
 * run `pnpm types:gen` to replace these with generated types from
 * the live Supabase project.
 */

export type DamageType =
  | 'downed_line'
  | 'leaning_pole'
  | 'tree_on_wire'
  | 'transformer'
  | 'vegetation'
  | 'other';

export type ReportStatus =
  | 'reported'
  | 'acknowledged'
  | 'dispatched'
  | 'resolved'
  | 'invalid';

export type ProRole =
  | 'contractor'
  | 'building_manager'
  | 'clearwire_crew'
  | 'municipality';

export interface Report {
  id: string;
  created_at: string;
  reporter_id: string | null;
  reporter_device_id: string | null;
  damage_type: DamageType;
  description: string | null;
  photo_url: string;
  // Supabase returns geography as GeoJSON when selected via PostgREST
  location: { type: 'Point'; coordinates: [number, number] };
  accuracy_meters: number | null;
  status: ReportStatus;
  is_test: boolean;
  verified_by_pro: boolean;
}

export interface ProProfile {
  id: string;
  created_at: string;
  display_name: string | null;
  company: string | null;
  role: ProRole | null;
  expo_push_token: string | null;
  alert_radius_miles: number;
  last_known_location: { type: 'Point'; coordinates: [number, number] } | null;
}

export const DAMAGE_TYPE_LABELS: Record<DamageType, string> = {
  downed_line: 'Downed line',
  leaning_pole: 'Leaning pole',
  tree_on_wire: 'Tree on wire',
  transformer: 'Transformer issue',
  vegetation: 'Vegetation contact',
  other: 'Other',
};
