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
  photo_urls: string[];
  // Supabase returns geography as GeoJSON when selected via PostgREST
  location: { type: 'Point'; coordinates: [number, number] };
  accuracy_meters: number | null;
  status: ReportStatus;
  is_test: boolean;
  verified_by_pro: boolean;
  affected_company: string | null;
  services_affected: ServiceType[] | null;
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

/**
 * Lucide icon names — same string works on web (`lucide-react`) and
 * native (`lucide-react-native`). Keep this enum-complete so TS catches
 * missing entries when a new damage type is added.
 */
export const DAMAGE_TYPE_ICONS: Record<DamageType, string> = {
  downed_line: 'Zap',
  leaning_pole: 'AlertTriangle',
  tree_on_wire: 'Trees',
  transformer: 'Bolt',
  vegetation: 'Sprout',
  other: 'HelpCircle',
};

// ─── Outage reports (service-loss, customer-side) ────────────────────────────

export type ServiceType =
  | 'internet'
  | 'cable_tv'
  | 'phone'
  | 'electric'
  | 'water'
  | 'other';

export type OutageStatus = 'reported' | 'confirmed' | 'resolved' | 'invalid';

export interface OutageReport {
  id: string;
  created_at: string;
  resolved_at: string | null;
  reporter_id: string | null;
  reporter_device_id: string | null;
  service_type: ServiceType;
  provider_company: string;
  service_location: { type: 'Point'; coordinates: [number, number] };
  description: string | null;
  status: OutageStatus;
  external_ticket: string | null;
  is_test: boolean;
}

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  internet: 'Internet',
  cable_tv: 'Cable TV',
  phone: 'Phone',
  electric: 'Electric',
  water: 'Water',
  other: 'Other',
};

export const SERVICE_TYPE_ICONS: Record<ServiceType, string> = {
  internet: 'Wifi',
  cable_tv: 'Tv',
  phone: 'Phone',
  electric: 'Zap',
  water: 'Droplets',
  other: 'HelpCircle',
};

// APWA-aligned colors: telecom orange for comms, electric red for power,
// water blue for water.
export const SERVICE_TYPE_COLORS: Record<ServiceType, string> = {
  internet: '#EA580C',
  cable_tv: '#EA580C',
  phone: '#EA580C',
  electric: '#DC2626',
  water: '#2563EB',
  other: '#7A94AE',
};

// ─── Map queries (nearby_reports / nearby_outages RPC return shapes) ─────────

export interface NearbyReport {
  id: string;
  created_at: string;
  damage_type: DamageType;
  description: string | null;
  photo_urls: string[];
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  status: ReportStatus;
  verified_by_pro: boolean;
  affected_company: string | null;
  reporter_display_name: string | null;
  services_affected: ServiceType[] | null;
}

export interface NearbyOutage {
  id: string;
  created_at: string;
  resolved_at: string | null;
  service_type: ServiceType;
  provider_company: string;
  description: string | null;
  latitude: number;
  longitude: number;
  status: OutageStatus;
  external_ticket: string | null;
  reporter_display_name: string | null;
}
