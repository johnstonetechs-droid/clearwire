import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import * as Location from 'expo-location';

import { T, palette } from '@clearwire/brand';
import {
  type ServiceType,
  type OutageStatus,
  SERVICE_TYPE_LABELS,
  SERVICE_TYPE_ICONS,
  SERVICE_TYPE_COLORS,
} from '@clearwire/supabase';

import { supabase } from '../lib/supabase';
import { DamageIcon } from '../components/DamageIcon';

const FALLBACK_CENTER: [number, number] = [41.4993, -81.6944];
const DEFAULT_RADIUS_MILES = 25;
const DEFAULT_SINCE_HOURS = 72;

type Center = { lat: number; lng: number };
type ViewMode = 'map' | 'list';

type NearbyOutage = {
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
};

export default function OutagesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ outageId?: string }>();
  const [center, setCenter] = useState<Center | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const [outages, setOutages] = useState<NearbyOutage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<NearbyOutage | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [view, setView] = useState<ViewMode>('map');
  const [serviceFilter, setServiceFilter] = useState<Set<ServiceType>>(new Set());
  const [providerFilter, setProviderFilter] = useState<Set<string>>(new Set());

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
      setOutages(null);
      const { data, error: rpcError } = await supabase.rpc('nearby_outages', {
        lat: center.lat,
        lng: center.lng,
        radius_miles: DEFAULT_RADIUS_MILES,
        since_hours: DEFAULT_SINCE_HOURS,
      });
      if (rpcError) {
        setError(rpcError.message);
        setOutages([]);
        return;
      }
      setOutages((data ?? []) as NearbyOutage[]);
    })();
  }, [center, refreshKey]);

  const providersInResults = useMemo(() => {
    const set = new Set<string>();
    (outages ?? []).forEach((o) => {
      if (o.provider_company) set.add(o.provider_company);
    });
    return Array.from(set).sort();
  }, [outages]);

  const filtered = useMemo(() => {
    return (outages ?? []).filter((o) => {
      if (serviceFilter.size > 0 && !serviceFilter.has(o.service_type)) return false;
      if (providerFilter.size > 0 && !providerFilter.has(o.provider_company)) return false;
      return true;
    });
  }, [outages, serviceFilter, providerFilter]);

  const byId = useMemo(() => {
    const map: Record<string, NearbyOutage> = {};
    filtered.forEach((o) => {
      map[o.id] = o;
    });
    return map;
  }, [filtered]);

  // Arrived with ?outageId=... from a tapped outage push → open sheet.
  useEffect(() => {
    if (!params.outageId || !outages) return;
    const match = outages.find((o) => o.id === params.outageId);
    if (match) setSelected(match);
  }, [params.outageId, outages]);

  const html = useMemo(() => {
    if (!center || !outages) return null;
    return buildOutagesHtml(center, filtered);
  }, [center, filtered]);

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      try {
        const msg = JSON.parse(e.nativeEvent.data) as { type: string; id?: string };
        if (msg.type === 'marker-tap' && msg.id) {
          const o = byId[msg.id];
          if (o) setSelected(o);
        }
      } catch {
        /* ignore */
      }
    },
    [byId]
  );

  function toggleService(t: ServiceType) {
    setServiceFilter((prev) => {
      const next = new Set(prev);
      next.has(t) ? next.delete(t) : next.add(t);
      return next;
    });
  }

  function toggleProvider(name: string) {
    setProviderFilter((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

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
          <Text style={styles.bannerText}>Couldn't load outages: {error}</Text>
        </View>
      )}

      <View style={styles.filters}>
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
                onPress={() => toggleService(type)}
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
                <Text
                  style={[
                    styles.filterChipText,
                    active && styles.filterChipTextActive,
                  ]}
                >
                  {SERVICE_TYPE_LABELS[type]}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {providersInResults.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {providersInResults.map((name) => {
              const active = providerFilter.has(name);
              return (
                <Pressable
                  key={name}
                  onPress={() => toggleProvider(name)}
                  style={[
                    styles.filterChip,
                    active && { backgroundColor: T.primary, borderColor: T.primary },
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      active && styles.filterChipTextActive,
                    ]}
                  >
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
                {!center ? 'Getting GPS fix…' : 'Loading outages…'}
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
          <OutageList outages={filtered} onTap={setSelected} loading={!outages} />
        )}
      </View>

      {view === 'map' && outages && filtered.length === 0 && !error && (
        <View style={styles.emptyOverlay} pointerEvents="none">
          <Text style={styles.emptyText}>
            {outages.length === 0
              ? `No outages in the last ${DEFAULT_SINCE_HOURS}h within ${DEFAULT_RADIUS_MILES} mi`
              : 'No outages match the filters'}
          </Text>
        </View>
      )}

      {selected && <OutageSheet outage={selected} onClose={() => setSelected(null)} />}
    </SafeAreaView>
  );
}

function OutageList({
  outages,
  onTap,
  loading,
}: {
  outages: NearbyOutage[];
  onTap: (o: NearbyOutage) => void;
  loading: boolean;
}) {
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={T.primary} />
      </View>
    );
  }
  if (outages.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>No outages match the filters.</Text>
      </View>
    );
  }
  return (
    <FlatList
      data={outages}
      keyExtractor={(o) => o.id}
      contentContainerStyle={styles.listContent}
      renderItem={({ item }) => (
        <Pressable onPress={() => onTap(item)} style={styles.listItem}>
          <View
            style={[
              styles.listIconSlot,
              { backgroundColor: SERVICE_TYPE_COLORS[item.service_type] },
            ]}
          >
            <DamageIcon
              name={SERVICE_TYPE_ICONS[item.service_type]}
              size={22}
              color={palette.white}
            />
          </View>
          <View style={styles.listBody}>
            <Text style={styles.listProvider}>
              {item.provider_company} · {SERVICE_TYPE_LABELS[item.service_type]}
            </Text>
            {item.description && (
              <Text style={styles.listDescription} numberOfLines={2}>
                {item.description}
              </Text>
            )}
            <View style={styles.listMetaRow}>
              <Text style={styles.listMeta}>{timeAgo(item.created_at)}</Text>
              {item.reporter_display_name && (
                <Text style={styles.listMeta}>· {item.reporter_display_name}</Text>
              )}
              {item.status !== 'reported' && (
                <Text style={styles.listMeta}>· {item.status}</Text>
              )}
            </View>
          </View>
        </Pressable>
      )}
    />
  );
}

function OutageSheet({
  outage,
  onClose,
}: {
  outage: NearbyOutage;
  onClose: () => void;
}) {
  return (
    <View style={styles.sheetBackdrop}>
      <Pressable style={styles.sheetBackdropTap} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <ScrollView contentContainerStyle={styles.sheetContent}>
          <View style={styles.sheetHeader}>
            <View
              style={[
                styles.servicePill,
                { backgroundColor: SERVICE_TYPE_COLORS[outage.service_type] },
              ]}
            >
              <DamageIcon
                name={SERVICE_TYPE_ICONS[outage.service_type]}
                size={14}
                color={palette.white}
              />
              <Text style={styles.servicePillText}>
                {SERVICE_TYPE_LABELS[outage.service_type]}
              </Text>
            </View>
            <Text style={styles.sheetAge}>{timeAgo(outage.created_at)}</Text>
          </View>

          <Text style={styles.provider}>{outage.provider_company}</Text>

          {outage.reporter_display_name && (
            <Text style={styles.sheetAttribution}>
              Reported by {outage.reporter_display_name}
            </Text>
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

          <Pressable style={styles.sheetCloseBtn} onPress={onClose}>
            <Text style={styles.sheetCloseText}>Close</Text>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  );
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

function buildOutagesHtml(center: Center, outages: NearbyOutage[]): string {
  const markers = outages.map((o) => ({
    id: o.id,
    lat: o.latitude,
    lng: o.longitude,
    color: SERVICE_TYPE_COLORS[o.service_type] ?? palette.n400,
  }));
  const markersJson = JSON.stringify(markers);
  const centerJson = JSON.stringify([center.lat, center.lng]);
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
    .cw-pin {
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
      var map = L.map('map', { zoomControl: true, attributionControl: false })
        .setView(center, 12);
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
        maxClusterRadius: 60
      });

      // Outage markers are diamonds (rotated squares) to distinguish them from
      // the round damage-report pins on the other screen.
      markers.forEach(function(m){
        var icon = L.divIcon({
          className: '',
          html: '<div class="cw-pin" style="background:' + m.color + '"></div>',
          iconSize: [18, 18],
          iconAnchor: [9, 9]
        });
        var marker = L.marker([m.lat, m.lng], { icon: icon });
        marker.on('click', function(){ post({ type: 'marker-tap', id: m.id }); });
        cluster.addLayer(marker);
      });
      map.addLayer(cluster);

      if (markers.length > 0) {
        var bounds = L.latLngBounds([center].concat(markers.map(function(m){ return [m.lat, m.lng]; })));
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: T.space.md,
  },
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
  listIconSlot: {
    width: 48,
    height: 48,
    borderRadius: T.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listBody: { flex: 1, gap: T.space.xs },
  listProvider: { color: T.text, fontSize: T.font.md, fontWeight: '700' },
  listDescription: { color: T.textMuted, fontSize: T.font.sm, lineHeight: 18 },
  listMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  listMeta: { color: T.textDim, fontSize: T.font.xs },
  emptyOverlay: {
    position: 'absolute',
    top: 180,
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
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
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
});
