import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Image,
  ScrollView,
  FlatList,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import * as Location from 'expo-location';

import { T, APWA_COLORS, palette } from '@clearwire/brand';
import {
  type DamageType,
  type ReportStatus,
  type ServiceType,
  type OutageStatus,
  DAMAGE_TYPE_LABELS,
  DAMAGE_TYPE_ICONS,
  SERVICE_TYPE_LABELS,
  SERVICE_TYPE_ICONS,
  SERVICE_TYPE_COLORS,
} from '@clearwire/supabase';
import {
  DEFAULT_RADIUS_MILES,
  DEFAULT_SINCE_HOURS,
  collectOrgs,
  fetchNearbyOutages,
  fetchNearbyReports,
  filterOutages,
  filterReports,
  type NearbyOutage,
  type NearbyReport,
} from '@clearwire/map-logic';

import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useToggleSet } from '../lib/useToggleSet';
import { DamageIcon } from '../components/DamageIcon';

const FALLBACK_CENTER: [number, number] = [41.4993, -81.6944];

type Center = { lat: number; lng: number };
type ViewMode = 'map' | 'list';

type IncidentItem =
  | { kind: 'damage'; data: NearbyReport }
  | { kind: 'outage'; data: NearbyOutage };

export default function IncidentsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ reportId?: string; outageId?: string }>();

  const [center, setCenter] = useState<Center | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const [reports, setReports] = useState<NearbyReport[] | null>(null);
  const [outages, setOutages] = useState<NearbyOutage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<IncidentItem | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [view, setView] = useState<ViewMode>('map');

  // Master type toggles (both on by default).
  const [showDamage, setShowDamage] = useState(true);
  const [showOutages, setShowOutages] = useState(true);

  // Secondary filters.
  const damageFilter = useToggleSet<DamageType>();
  const serviceFilter = useToggleSet<ServiceType>();
  const orgFilter = useToggleSet<string>();

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationDenied(true);
        setCenter({ lat: FALLBACK_CENTER[0], lng: FALLBACK_CENTER[1] });
        return;
      }
      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      } catch {
        setCenter({ lat: FALLBACK_CENTER[0], lng: FALLBACK_CENTER[1] });
      }
    })();
  }, []);

  useEffect(() => {
    if (!center) return;
    (async () => {
      setError(null);
      setReports(null);
      setOutages(null);

      const [damageRes, outageRes] = await Promise.all([
        fetchNearbyReports(supabase, { lat: center.lat, lng: center.lng }),
        fetchNearbyOutages(supabase, { lat: center.lat, lng: center.lng }),
      ]);

      const messages: string[] = [];
      if (damageRes.error) messages.push(`damage: ${damageRes.error}`);
      if (outageRes.error) messages.push(`outages: ${outageRes.error}`);
      if (messages.length) setError(messages.join(' · '));

      setReports(damageRes.data);
      setOutages(outageRes.data);
    })();
  }, [center, refreshKey]);

  // Unique organizations across both data sources (affected_company on damage,
  // provider_company on outages). One filter selects across both.
  const orgsInResults = useMemo(
    () => collectOrgs(reports ?? [], outages ?? []),
    [reports, outages]
  );

  const filteredDamage = useMemo(
    () =>
      showDamage
        ? filterReports(reports ?? [], {
            damageTypes: damageFilter.values,
            serviceTypes: serviceFilter.values,
            orgs: orgFilter.values,
          })
        : [],
    [
      reports,
      showDamage,
      damageFilter.values,
      serviceFilter.values,
      orgFilter.values,
    ]
  );

  const filteredOutages = useMemo(
    () =>
      showOutages
        ? filterOutages(outages ?? [], {
            serviceTypes: serviceFilter.values,
            orgs: orgFilter.values,
          })
        : [],
    [outages, showOutages, serviceFilter.values, orgFilter.values]
  );

  const reportsById = useMemo(() => {
    const m: Record<string, NearbyReport> = {};
    filteredDamage.forEach((r) => (m[r.id] = r));
    return m;
  }, [filteredDamage]);

  const outagesById = useMemo(() => {
    const m: Record<string, NearbyOutage> = {};
    filteredOutages.forEach((o) => (m[o.id] = o));
    return m;
  }, [filteredOutages]);

  const html = useMemo(() => {
    if (!center || (!reports && !outages)) return null;
    return buildIncidentsHtml(center, filteredDamage, filteredOutages);
  }, [center, filteredDamage, filteredOutages]);

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      try {
        const msg = JSON.parse(e.nativeEvent.data) as {
          type: string;
          kind?: 'damage' | 'outage';
          id?: string;
        };
        if (msg.type !== 'marker-tap' || !msg.id || !msg.kind) return;
        if (msg.kind === 'damage') {
          const r = reportsById[msg.id];
          if (r) setSelected({ kind: 'damage', data: r });
        } else {
          const o = outagesById[msg.id];
          if (o) setSelected({ kind: 'outage', data: o });
        }
      } catch {
        /* ignore */
      }
    },
    [reportsById, outagesById]
  );

  // Deep-link params from push notifications.
  useEffect(() => {
    if (params.reportId && reports) {
      const match = reports.find((r) => r.id === params.reportId);
      if (match) setSelected({ kind: 'damage', data: match });
    } else if (params.outageId && outages) {
      const match = outages.find((o) => o.id === params.outageId);
      if (match) setSelected({ kind: 'outage', data: match });
    }
  }, [params.reportId, params.outageId, reports, outages]);

  // Merged + sorted list for list view.
  const listItems: IncidentItem[] = useMemo(() => {
    const dmg: IncidentItem[] = filteredDamage.map((r) => ({ kind: 'damage', data: r }));
    const out: IncidentItem[] = filteredOutages.map((o) => ({ kind: 'outage', data: o }));
    return [...dmg, ...out].sort((a, b) =>
      b.data.created_at.localeCompare(a.data.created_at)
    );
  }, [filteredDamage, filteredOutages]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn} hitSlop={12}>
          <Text style={styles.headerBtnText}>← Back</Text>
        </Pressable>
        <View style={styles.viewToggle}>
          <Pressable
            onPress={() => setView('map')}
            style={[styles.viewTab, view === 'map' && styles.viewTabActive]}
          >
            <Text style={[styles.viewTabText, view === 'map' && styles.viewTabTextActive]}>
              Map
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setView('list')}
            style={[styles.viewTab, view === 'list' && styles.viewTabActive]}
          >
            <Text style={[styles.viewTabText, view === 'list' && styles.viewTabTextActive]}>
              List
            </Text>
          </Pressable>
        </View>
        <Pressable
          onPress={() => setRefreshKey((k) => k + 1)}
          style={styles.headerBtn}
          hitSlop={12}
        >
          <Text style={styles.headerBtnText}>Refresh</Text>
        </Pressable>
      </View>

      {locationDenied && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            Location access denied — showing Cleveland area.
          </Text>
        </View>
      )}
      {error && (
        <View style={[styles.banner, styles.bannerError]}>
          <Text style={styles.bannerText}>Some data failed: {error}</Text>
        </View>
      )}

      <View style={styles.filters}>
        <View style={styles.masterRow}>
          <Pressable
            onPress={() => setShowDamage((v) => !v)}
            style={[styles.masterChip, showDamage && styles.masterChipOn]}
          >
            <View style={[styles.masterDot, styles.damageDot]} />
            <Text style={[styles.masterText, showDamage && styles.masterTextOn]}>
              Damage ({reports?.length ?? 0})
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setShowOutages((v) => !v)}
            style={[styles.masterChip, showOutages && styles.masterChipOn]}
          >
            <View style={[styles.masterDot, styles.outageDot]} />
            <Text style={[styles.masterText, showOutages && styles.masterTextOn]}>
              Outages ({outages?.length ?? 0})
            </Text>
          </Pressable>
        </View>

        {showDamage && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {(Object.keys(DAMAGE_TYPE_LABELS) as DamageType[]).map((type) => {
              const active = damageFilter.has(type);
              return (
                <Pressable
                  key={type}
                  onPress={() => damageFilter.toggle(type)}
                  style={[
                    styles.filterChip,
                    active && { backgroundColor: APWA_COLORS[type], borderColor: APWA_COLORS[type] },
                  ]}
                >
                  <DamageIcon
                    name={DAMAGE_TYPE_ICONS[type]}
                    size={14}
                    color={active ? palette.white : T.text}
                  />
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                    {DAMAGE_TYPE_LABELS[type]}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {showOutages && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {(Object.keys(SERVICE_TYPE_LABELS) as ServiceType[]).map((type) => {
              const active = serviceFilter.has(type);
              return (
                <Pressable
                  key={type}
                  onPress={() => serviceFilter.toggle(type)}
                  style={[
                    styles.filterChip,
                    active && {
                      backgroundColor: SERVICE_TYPE_COLORS[type],
                      borderColor: SERVICE_TYPE_COLORS[type],
                    },
                  ]}
                >
                  <DamageIcon
                    name={SERVICE_TYPE_ICONS[type]}
                    size={14}
                    color={active ? palette.white : T.text}
                  />
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                    {SERVICE_TYPE_LABELS[type]}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {orgsInResults.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {orgsInResults.map((name) => {
              const active = orgFilter.has(name);
              return (
                <Pressable
                  key={name}
                  onPress={() => orgFilter.toggle(name)}
                  style={[
                    styles.filterChip,
                    active && { backgroundColor: T.primary, borderColor: T.primary },
                  ]}
                >
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                    {name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>

      <View style={styles.content}>
        {view === 'map' ? (
          !html ? (
            <View style={styles.center}>
              <ActivityIndicator color={T.primary} />
              <Text style={styles.loadingText}>
                {!center ? 'Getting GPS fix…' : 'Loading incidents…'}
              </Text>
            </View>
          ) : (
            <WebView
              key={refreshKey}
              originWhitelist={['*']}
              source={{ html }}
              onMessage={onMessage}
              javaScriptEnabled
              domStorageEnabled
              style={styles.webview}
              containerStyle={{ backgroundColor: palette.navy900 }}
            />
          )
        ) : (
          <IncidentList items={listItems} onTap={setSelected} loading={!reports || !outages} />
        )}
      </View>

      {view === 'map' && reports && outages && filteredDamage.length === 0 && filteredOutages.length === 0 && (
        <View style={styles.emptyOverlay} pointerEvents="none">
          <Text style={styles.emptyText}>No incidents match the filters</Text>
        </View>
      )}

      {selected?.kind === 'damage' && (
        <ReportSheet
          report={selected.data}
          onClose={() => setSelected(null)}
          onStatusChanged={() => {
            setSelected(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
      {selected?.kind === 'outage' && (
        <OutageSheet
          outage={selected.data}
          onClose={() => setSelected(null)}
          onStatusChanged={() => {
            setSelected(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </SafeAreaView>
  );
}

function IncidentList({
  items,
  onTap,
  loading,
}: {
  items: IncidentItem[];
  onTap: (i: IncidentItem) => void;
  loading: boolean;
}) {
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={T.primary} />
      </View>
    );
  }
  if (items.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>No incidents match the filters.</Text>
      </View>
    );
  }
  return (
    <FlatList
      data={items}
      keyExtractor={(item) => `${item.kind}:${item.data.id}`}
      contentContainerStyle={styles.listContent}
      renderItem={({ item }) =>
        item.kind === 'damage' ? (
          <DamageListCard report={item.data} onTap={() => onTap(item)} />
        ) : (
          <OutageListCard outage={item.data} onTap={() => onTap(item)} />
        )
      }
    />
  );
}

function DamageListCard({ report, onTap }: { report: NearbyReport; onTap: () => void }) {
  return (
    <Pressable onPress={onTap} style={styles.listItem}>
      {report.photo_urls[0] && (
        <Image source={{ uri: report.photo_urls[0] }} style={styles.listThumb} />
      )}
      <View style={styles.listBody}>
        <View style={[styles.listPill, { backgroundColor: APWA_COLORS[report.damage_type] }]}>
          <DamageIcon name={DAMAGE_TYPE_ICONS[report.damage_type]} size={12} color={palette.white} />
          <Text style={styles.listPillText}>{DAMAGE_TYPE_LABELS[report.damage_type]}</Text>
        </View>
        {report.description && (
          <Text style={styles.listDescription} numberOfLines={2}>
            {report.description}
          </Text>
        )}
        <View style={styles.listMetaRow}>
          <Text style={styles.listMeta}>{timeAgo(report.created_at)}</Text>
          {report.reporter_display_name && (
            <Text style={styles.listMeta}>· {report.reporter_display_name}</Text>
          )}
          {report.affected_company && (
            <Text style={styles.listMeta}>· {report.affected_company}</Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function OutageListCard({ outage, onTap }: { outage: NearbyOutage; onTap: () => void }) {
  return (
    <Pressable onPress={onTap} style={styles.listItem}>
      <View style={[styles.listIconSlot, { backgroundColor: SERVICE_TYPE_COLORS[outage.service_type] }]}>
        <DamageIcon
          name={SERVICE_TYPE_ICONS[outage.service_type]}
          size={22}
          color={palette.white}
        />
      </View>
      <View style={styles.listBody}>
        <Text style={styles.listProvider}>
          {outage.provider_company} · {SERVICE_TYPE_LABELS[outage.service_type]}
        </Text>
        {outage.description && (
          <Text style={styles.listDescription} numberOfLines={2}>
            {outage.description}
          </Text>
        )}
        <View style={styles.listMetaRow}>
          <Text style={styles.listMeta}>{timeAgo(outage.created_at)}</Text>
          {outage.reporter_display_name && (
            <Text style={styles.listMeta}>· {outage.reporter_display_name}</Text>
          )}
          {outage.status !== 'reported' && <Text style={styles.listMeta}>· {outage.status}</Text>}
        </View>
      </View>
    </Pressable>
  );
}

// ─── Report sheet (damage) ────────────────────────────────────────────────────
function ReportSheet({
  report,
  onClose,
  onStatusChanged,
}: {
  report: NearbyReport;
  onClose: () => void;
  onStatusChanged: () => void;
}) {
  const auth = useAuth();
  const [updating, setUpdating] = useState<string | null>(null);
  const signedIn = auth.state === 'signed-in';

  async function setStatus(next: ReportStatus) {
    setUpdating(next);
    const { error } = await supabase.from('reports').update({ status: next }).eq('id', report.id);
    setUpdating(null);
    if (error) {
      Alert.alert('Update failed', error.message);
      return;
    }
    onStatusChanged();
  }

  return (
    <View style={styles.sheetBackdrop}>
      <Pressable style={styles.sheetBackdropTap} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <ScrollView contentContainerStyle={styles.sheetContent}>
          {report.photo_urls[0] && (
            <Image source={{ uri: report.photo_urls[0] }} style={styles.sheetPhoto} />
          )}
          {report.photo_urls.length > 1 && (
            <Text style={styles.sheetMeta}>
              +{report.photo_urls.length - 1} more photo{report.photo_urls.length > 2 ? 's' : ''}
            </Text>
          )}
          <View style={styles.sheetHeader}>
            <View style={[styles.damagePill, { backgroundColor: APWA_COLORS[report.damage_type] }]}>
              <DamageIcon
                name={DAMAGE_TYPE_ICONS[report.damage_type]}
                size={14}
                color={palette.white}
              />
              <Text style={styles.damagePillText}>{DAMAGE_TYPE_LABELS[report.damage_type]}</Text>
            </View>
            <Text style={styles.sheetAge}>{timeAgo(report.created_at)}</Text>
          </View>
          {report.reporter_display_name && (
            <Text style={styles.sheetAttribution}>Reported by {report.reporter_display_name}</Text>
          )}
          {report.affected_company && (
            <Text style={styles.sheetMeta}>Service: {report.affected_company}</Text>
          )}
          {report.description && (
            <Text style={styles.sheetDescription}>{report.description}</Text>
          )}
          {report.accuracy_meters != null && (
            <Text style={styles.sheetMeta}>
              GPS accuracy ±{Math.round(report.accuracy_meters)}m
            </Text>
          )}
          <Text style={styles.sheetMeta}>Status: {report.status}</Text>

          {signedIn && (
            <View style={styles.statusActions}>
              {reportNextStates(report.status).map((next) => (
                <Pressable
                  key={next.value}
                  onPress={() => setStatus(next.value)}
                  disabled={updating !== null}
                  style={[
                    styles.statusBtn,
                    next.destructive && styles.statusBtnDanger,
                    updating !== null && styles.statusBtnDisabled,
                  ]}
                >
                  {updating === next.value ? (
                    <ActivityIndicator color={T.text} size="small" />
                  ) : (
                    <Text
                      style={[
                        styles.statusBtnText,
                        next.destructive && styles.statusBtnTextDanger,
                      ]}
                    >
                      {next.label}
                    </Text>
                  )}
                </Pressable>
              ))}
            </View>
          )}

          <Pressable style={styles.sheetCloseBtn} onPress={onClose}>
            <Text style={styles.sheetCloseText}>Close</Text>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  );
}

function reportNextStates(
  current: ReportStatus
): Array<{ value: ReportStatus; label: string; destructive?: boolean }> {
  switch (current) {
    case 'reported':
      return [
        { value: 'acknowledged', label: 'Acknowledge' },
        { value: 'invalid', label: 'Mark invalid', destructive: true },
      ];
    case 'acknowledged':
      return [
        { value: 'dispatched', label: 'Mark dispatched' },
        { value: 'invalid', label: 'Mark invalid', destructive: true },
      ];
    case 'dispatched':
      return [
        { value: 'resolved', label: 'Mark resolved' },
        { value: 'invalid', label: 'Mark invalid', destructive: true },
      ];
    case 'resolved':
    case 'invalid':
      return [{ value: 'reported', label: 'Reopen' }];
    default:
      return [];
  }
}

// ─── Outage sheet ─────────────────────────────────────────────────────────────
function OutageSheet({
  outage,
  onClose,
  onStatusChanged,
}: {
  outage: NearbyOutage;
  onClose: () => void;
  onStatusChanged: () => void;
}) {
  const auth = useAuth();
  const [updating, setUpdating] = useState<string | null>(null);
  const signedIn = auth.state === 'signed-in';

  async function setStatus(next: OutageStatus) {
    setUpdating(next);
    const patch: { status: OutageStatus; resolved_at?: string | null } = { status: next };
    if (next === 'resolved') patch.resolved_at = new Date().toISOString();
    if (next === 'reported' || next === 'confirmed') patch.resolved_at = null;
    const { error } = await supabase.from('outage_reports').update(patch).eq('id', outage.id);
    setUpdating(null);
    if (error) {
      Alert.alert('Update failed', error.message);
      return;
    }
    onStatusChanged();
  }

  return (
    <View style={styles.sheetBackdrop}>
      <Pressable style={styles.sheetBackdropTap} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <ScrollView contentContainerStyle={styles.sheetContent}>
          <View style={styles.sheetHeader}>
            <View
              style={[styles.servicePill, { backgroundColor: SERVICE_TYPE_COLORS[outage.service_type] }]}
            >
              <DamageIcon
                name={SERVICE_TYPE_ICONS[outage.service_type]}
                size={14}
                color={palette.white}
              />
              <Text style={styles.servicePillText}>{SERVICE_TYPE_LABELS[outage.service_type]}</Text>
            </View>
            <Text style={styles.sheetAge}>{timeAgo(outage.created_at)}</Text>
          </View>
          <Text style={styles.provider}>{outage.provider_company}</Text>
          {outage.reporter_display_name && (
            <Text style={styles.sheetAttribution}>Reported by {outage.reporter_display_name}</Text>
          )}
          {outage.description && (
            <Text style={styles.sheetDescription}>{outage.description}</Text>
          )}
          {outage.external_ticket && (
            <Text style={styles.sheetMeta}>Provider ticket: {outage.external_ticket}</Text>
          )}
          <Text style={styles.sheetMeta}>
            Status: {outage.status}
            {outage.resolved_at ? ` · resolved ${timeAgo(outage.resolved_at)}` : ''}
          </Text>

          {signedIn && (
            <View style={styles.statusActions}>
              {outageNextStates(outage.status).map((next) => (
                <Pressable
                  key={next.value}
                  onPress={() => setStatus(next.value)}
                  disabled={updating !== null}
                  style={[
                    styles.statusBtn,
                    next.destructive && styles.statusBtnDanger,
                    updating !== null && styles.statusBtnDisabled,
                  ]}
                >
                  {updating === next.value ? (
                    <ActivityIndicator color={T.text} size="small" />
                  ) : (
                    <Text
                      style={[
                        styles.statusBtnText,
                        next.destructive && styles.statusBtnTextDanger,
                      ]}
                    >
                      {next.label}
                    </Text>
                  )}
                </Pressable>
              ))}
            </View>
          )}

          <Pressable style={styles.sheetCloseBtn} onPress={onClose}>
            <Text style={styles.sheetCloseText}>Close</Text>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  );
}

function outageNextStates(
  current: OutageStatus
): Array<{ value: OutageStatus; label: string; destructive?: boolean }> {
  switch (current) {
    case 'reported':
      return [
        { value: 'confirmed', label: 'Confirm' },
        { value: 'invalid', label: 'Mark invalid', destructive: true },
      ];
    case 'confirmed':
      return [
        { value: 'resolved', label: 'Mark resolved' },
        { value: 'invalid', label: 'Mark invalid', destructive: true },
      ];
    case 'resolved':
      return [{ value: 'confirmed', label: 'Reopen' }];
    case 'invalid':
      return [{ value: 'reported', label: 'Reopen' }];
    default:
      return [];
  }
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function buildIncidentsHtml(
  center: Center,
  damage: NearbyReport[],
  outages: NearbyOutage[]
): string {
  const damageMarkers = damage.map((r) => ({
    kind: 'damage',
    id: r.id,
    lat: r.latitude,
    lng: r.longitude,
    color: APWA_COLORS[r.damage_type] ?? palette.n400,
  }));
  const outageMarkers = outages.map((o) => ({
    kind: 'outage',
    id: o.id,
    lat: o.latitude,
    lng: o.longitude,
    color: SERVICE_TYPE_COLORS[o.service_type] ?? palette.n400,
  }));

  const allCoords = [...damageMarkers, ...outageMarkers].map((m) => [m.lat, m.lng]);
  const markersJson = JSON.stringify([...damageMarkers, ...outageMarkers]);
  const centerJson = JSON.stringify([center.lat, center.lng]);
  const boundsJson = JSON.stringify(allCoords);
  const userColor = palette.blue600;

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css" />
  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; background: ${palette.navy900}; }
    .cw-pin-damage {
      width: 18px; height: 18px; border-radius: 50%;
      border: 3px solid ${palette.white};
      box-shadow: 0 0 0 1px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.5);
      cursor: pointer;
    }
    .cw-pin-outage {
      width: 18px; height: 18px;
      border: 3px solid ${palette.white};
      transform: rotate(45deg);
      box-shadow: 0 0 0 1px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.5);
      cursor: pointer;
    }
    .cw-user {
      width: 14px; height: 14px; border-radius: 50%;
      background: ${userColor};
      border: 3px solid ${palette.white};
      box-shadow: 0 0 0 6px ${userColor}33;
    }
    .leaflet-container { background: ${palette.navy900}; }
    .marker-cluster-small, .marker-cluster-medium, .marker-cluster-large {
      background-color: ${palette.blue600}55 !important;
    }
    .marker-cluster-small div, .marker-cluster-medium div, .marker-cluster-large div {
      background-color: ${palette.blue600}cc !important;
      color: ${palette.white} !important;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
  <script>
    (function(){
      var post = function(obj){
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify(obj));
        }
      };
      var center = ${centerJson};
      var markers = ${markersJson};
      var allCoords = ${boundsJson};
      var map = L.map('map', { zoomControl: true, attributionControl: false }).setView(center, 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
      L.control.attribution({ prefix: false }).addAttribution('© OpenStreetMap').addTo(map);

      L.marker(center, {
        icon: L.divIcon({
          className: '',
          html: '<div class="cw-user"></div>',
          iconSize: [14, 14],
          iconAnchor: [7, 7]
        }),
        interactive: false
      }).addTo(map);

      var cluster = L.markerClusterGroup({
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        maxClusterRadius: 50
      });

      markers.forEach(function(m){
        var cls = m.kind === 'damage' ? 'cw-pin-damage' : 'cw-pin-outage';
        var icon = L.divIcon({
          className: '',
          html: '<div class="' + cls + '" style="background:' + m.color + '"></div>',
          iconSize: [18, 18],
          iconAnchor: [9, 9]
        });
        var marker = L.marker([m.lat, m.lng], { icon: icon });
        marker.on('click', function(){ post({ type: 'marker-tap', kind: m.kind, id: m.id }); });
        cluster.addLayer(marker);
      });
      map.addLayer(cluster);

      if (allCoords.length > 0) {
        var bounds = L.latLngBounds([center].concat(allCoords));
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
      }
    })();
  </script>
</body>
</html>`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: T.space.md,
    paddingVertical: T.space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: T.border,
    gap: T.space.sm,
  },
  headerBtn: { paddingVertical: T.space.xs, paddingHorizontal: T.space.sm },
  headerBtnText: { color: T.primary, fontSize: T.font.sm, fontWeight: '600' },
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: T.surfaceAlt,
    borderRadius: T.radius.md,
    padding: 3,
    gap: 2,
  },
  viewTab: {
    paddingHorizontal: T.space.md,
    paddingVertical: T.space.xs + 2,
    borderRadius: T.radius.sm,
  },
  viewTabActive: { backgroundColor: T.primary },
  viewTabText: { color: T.textMuted, fontSize: T.font.sm, fontWeight: '600' },
  viewTabTextActive: { color: T.bg, fontWeight: '700' },
  banner: {
    backgroundColor: T.surfaceAlt,
    paddingHorizontal: T.space.lg,
    paddingVertical: T.space.sm,
  },
  bannerError: { backgroundColor: T.danger },
  bannerText: { color: T.text, fontSize: T.font.sm },
  filters: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: T.border,
    paddingVertical: T.space.sm,
    gap: T.space.xs,
  },
  masterRow: {
    flexDirection: 'row',
    gap: T.space.sm,
    paddingHorizontal: T.space.md,
    marginBottom: T.space.xs,
  },
  masterChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: T.space.xs + 2,
    paddingVertical: T.space.sm,
    paddingHorizontal: T.space.md,
    borderRadius: T.radius.md,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
    opacity: 0.5,
  },
  masterChipOn: { opacity: 1, borderColor: T.primary },
  masterDot: { width: 10, height: 10, borderWidth: 2, borderColor: palette.white },
  damageDot: { borderRadius: 5, backgroundColor: palette.telecom },
  outageDot: { transform: [{ rotate: '45deg' }], backgroundColor: palette.blue600 },
  masterText: { color: T.textMuted, fontSize: T.font.sm, fontWeight: '600' },
  masterTextOn: { color: T.text, fontWeight: '700' },
  filterRow: { gap: T.space.xs, paddingHorizontal: T.space.md },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: T.space.sm + 2,
    paddingVertical: T.space.xs + 2,
    borderRadius: T.radius.pill,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
  },
  filterChipText: { color: T.text, fontSize: T.font.xs, fontWeight: '500' },
  filterChipTextActive: { color: palette.white, fontWeight: '700' },
  content: { flex: 1 },
  webview: { flex: 1, backgroundColor: T.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: T.space.md },
  loadingText: { color: T.textMuted, fontSize: T.font.sm },
  listContent: { padding: T.space.md, gap: T.space.md },
  listItem: {
    flexDirection: 'row',
    gap: T.space.md,
    backgroundColor: T.surface,
    borderRadius: T.radius.md,
    padding: T.space.md,
    borderWidth: 1,
    borderColor: T.border,
    alignItems: 'center',
  },
  listThumb: {
    width: 72,
    height: 72,
    borderRadius: T.radius.sm,
    backgroundColor: T.surfaceAlt,
  },
  listIconSlot: {
    width: 48,
    height: 48,
    borderRadius: T.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listBody: { flex: 1, gap: T.space.xs },
  listProvider: { color: T.text, fontSize: T.font.md, fontWeight: '700' },
  listPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: T.space.sm,
    paddingVertical: 3,
    borderRadius: T.radius.pill,
  },
  listPillText: { color: palette.white, fontSize: T.font.xs, fontWeight: '700' },
  listDescription: { color: T.text, fontSize: T.font.sm, lineHeight: 18 },
  listMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  listMeta: { color: T.textMuted, fontSize: T.font.xs },
  emptyOverlay: {
    position: 'absolute',
    top: 220,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  emptyText: {
    color: T.text,
    fontSize: T.font.sm,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: T.space.md,
    paddingVertical: T.space.sm,
    borderRadius: T.radius.md,
  },
  sheetBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
  },
  sheetBackdropTap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: T.surface,
    borderTopLeftRadius: T.radius.xl,
    borderTopRightRadius: T.radius.xl,
    maxHeight: '75%',
    paddingBottom: T.space.lg,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: T.border,
    marginTop: T.space.sm,
    marginBottom: T.space.sm,
  },
  sheetContent: { padding: T.space.lg, gap: T.space.md },
  sheetPhoto: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: T.radius.lg,
    backgroundColor: T.surfaceAlt,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  damagePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: T.space.xs,
    paddingHorizontal: T.space.md,
    paddingVertical: T.space.xs + 2,
    borderRadius: T.radius.pill,
  },
  damagePillText: { color: palette.white, fontSize: T.font.sm, fontWeight: '700' },
  servicePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: T.space.xs,
    paddingHorizontal: T.space.md,
    paddingVertical: T.space.xs + 2,
    borderRadius: T.radius.pill,
  },
  servicePillText: { color: palette.white, fontSize: T.font.sm, fontWeight: '700' },
  sheetAge: { color: T.textMuted, fontSize: T.font.sm },
  provider: { color: T.text, fontSize: T.font.xl, fontWeight: '700' },
  sheetAttribution: { color: T.text, fontSize: T.font.sm, fontWeight: '600' },
  sheetDescription: { color: T.text, fontSize: T.font.md, lineHeight: 22 },
  sheetMeta: { color: T.textDim, fontSize: T.font.sm },
  sheetCloseBtn: {
    backgroundColor: T.surfaceAlt,
    paddingVertical: T.space.md,
    borderRadius: T.radius.md,
    alignItems: 'center',
    marginTop: T.space.sm,
  },
  sheetCloseText: { color: T.text, fontSize: T.font.md, fontWeight: '600' },
  statusActions: { flexDirection: 'row', flexWrap: 'wrap', gap: T.space.sm },
  statusBtn: {
    flexGrow: 1,
    flexBasis: '45%',
    paddingVertical: T.space.md,
    paddingHorizontal: T.space.md,
    borderRadius: T.radius.md,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.bg,
    alignItems: 'center',
  },
  statusBtnDanger: { borderColor: T.danger },
  statusBtnDisabled: { opacity: 0.4 },
  statusBtnText: { color: T.text, fontSize: T.font.sm, fontWeight: '600' },
  statusBtnTextDanger: { color: T.danger },
});
