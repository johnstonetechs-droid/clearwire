import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Image,
  ScrollView,
  FlatList,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';

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

import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { DamageIcon } from '../components/DamageIcon';
import {
  pickFromGallery,
  takePhotoWithPicker,
  type PickedPhoto,
} from '../lib/photoPicker';

type Tab = 'damage' | 'outages';

type MyDamage = {
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
};

type MyOutage = {
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

type Selection =
  | { kind: 'damage'; data: MyDamage }
  | { kind: 'outage'; data: MyOutage };

export default function MyActivityScreen() {
  const router = useRouter();
  const auth = useAuth();
  const [tab, setTab] = useState<Tab>('damage');
  const [damage, setDamage] = useState<MyDamage[] | null>(null);
  const [outages, setOutages] = useState<MyOutage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<Selection | null>(null);

  useEffect(() => {
    if (auth.state === 'signed-out') {
      router.replace('/sign-in');
    }
  }, [auth.state]);

  const load = useCallback(async () => {
    if (auth.state !== 'signed-in') return;
    setError(null);
    const [dmg, out] = await Promise.all([
      supabase.rpc('my_damage_reports'),
      supabase.rpc('my_outage_reports'),
    ]);
    const msgs: string[] = [];
    if (dmg.error) msgs.push(`damage: ${dmg.error.message}`);
    if (out.error) msgs.push(`outages: ${out.error.message}`);
    if (msgs.length) setError(msgs.join(' · '));
    setDamage((dmg.data ?? []) as MyDamage[]);
    setOutages((out.data ?? []) as MyOutage[]);
  }, [auth.state]);

  useEffect(() => {
    load();
  }, [load]);

  async function onPullRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const damageCounts = useMemo(() => countByStatus(damage ?? []), [damage]);
  const outageCounts = useMemo(() => countByStatus(outages ?? []), [outages]);

  if (auth.state === 'loading') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator color={T.primary} />
        </View>
      </SafeAreaView>
    );
  }
  if (auth.state !== 'signed-in') return null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn} hitSlop={12}>
          <Text style={styles.headerBtnText}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>My submissions</Text>
        <Pressable onPress={load} style={styles.headerBtn} hitSlop={12}>
          <Text style={styles.headerBtnText}>Refresh</Text>
        </Pressable>
      </View>

      <View style={styles.tabs}>
        <Pressable
          onPress={() => setTab('damage')}
          style={[styles.tab, tab === 'damage' && styles.tabActive]}
        >
          <Text style={[styles.tabText, tab === 'damage' && styles.tabTextActive]}>
            Damage ({damage?.length ?? 0})
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setTab('outages')}
          style={[styles.tab, tab === 'outages' && styles.tabActive]}
        >
          <Text style={[styles.tabText, tab === 'outages' && styles.tabTextActive]}>
            Outages ({outages?.length ?? 0})
          </Text>
        </Pressable>
      </View>

      {error && (
        <View style={[styles.banner, styles.bannerError]}>
          <Text style={styles.bannerText}>{error}</Text>
        </View>
      )}

      {tab === 'damage' ? (
        <DamageList
          items={damage}
          counts={damageCounts}
          refreshing={refreshing}
          onRefresh={onPullRefresh}
          onTap={(d) => setSelected({ kind: 'damage', data: d })}
        />
      ) : (
        <OutageList
          items={outages}
          counts={outageCounts}
          refreshing={refreshing}
          onRefresh={onPullRefresh}
          onTap={(o) => setSelected({ kind: 'outage', data: o })}
        />
      )}

      {selected?.kind === 'damage' && (
        <DamageSheet
          report={selected.data}
          onClose={() => setSelected(null)}
          onStatusChanged={() => {
            setSelected(null);
            load();
          }}
        />
      )}
      {selected?.kind === 'outage' && (
        <OutageSheet
          outage={selected.data}
          onClose={() => setSelected(null)}
          onStatusChanged={() => {
            setSelected(null);
            load();
          }}
        />
      )}
    </SafeAreaView>
  );
}

function countByStatus(items: { status: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  items.forEach((i) => {
    counts[i.status] = (counts[i.status] ?? 0) + 1;
  });
  return counts;
}

function StatusSummary({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts);
  if (entries.length === 0) return null;
  return (
    <View style={styles.summaryRow}>
      {entries.map(([status, n]) => (
        <View key={status} style={styles.summaryPill}>
          <Text style={styles.summaryPillText}>
            {status}: {n}
          </Text>
        </View>
      ))}
    </View>
  );
}

function DamageList({
  items,
  counts,
  refreshing,
  onRefresh,
  onTap,
}: {
  items: MyDamage[] | null;
  counts: Record<string, number>;
  refreshing: boolean;
  onRefresh: () => void;
  onTap: (d: MyDamage) => void;
}) {
  if (items === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={T.primary} />
      </View>
    );
  }
  if (items.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>
          You haven't submitted any damage reports yet.
        </Text>
      </View>
    );
  }
  return (
    <FlatList
      data={items}
      keyExtractor={(r) => r.id}
      contentContainerStyle={styles.listContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.text} />}
      ListHeaderComponent={<StatusSummary counts={counts} />}
      renderItem={({ item }) => (
        <Pressable onPress={() => onTap(item)} style={styles.listItem}>
          {item.photo_urls[0] && (
            <Image source={{ uri: item.photo_urls[0] }} style={styles.listThumb} />
          )}
          <View style={styles.listBody}>
            <View style={[styles.listPill, { backgroundColor: APWA_COLORS[item.damage_type] }]}>
              <DamageIcon
                name={DAMAGE_TYPE_ICONS[item.damage_type]}
                size={12}
                color={palette.white}
              />
              <Text style={styles.listPillText}>{DAMAGE_TYPE_LABELS[item.damage_type]}</Text>
            </View>
            {item.description && (
              <Text style={styles.listDescription} numberOfLines={2}>
                {item.description}
              </Text>
            )}
            <View style={styles.listMetaRow}>
              <Text style={styles.listMeta}>{timeAgo(item.created_at)}</Text>
              <Text style={[styles.listMeta, statusColor(item.status)]}>· {item.status}</Text>
              {item.affected_company && (
                <Text style={styles.listMeta}>· {item.affected_company}</Text>
              )}
            </View>
          </View>
        </Pressable>
      )}
    />
  );
}

function OutageList({
  items,
  counts,
  refreshing,
  onRefresh,
  onTap,
}: {
  items: MyOutage[] | null;
  counts: Record<string, number>;
  refreshing: boolean;
  onRefresh: () => void;
  onTap: (o: MyOutage) => void;
}) {
  if (items === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={T.primary} />
      </View>
    );
  }
  if (items.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>
          You haven't submitted any outage reports yet.
        </Text>
      </View>
    );
  }
  return (
    <FlatList
      data={items}
      keyExtractor={(o) => o.id}
      contentContainerStyle={styles.listContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.text} />}
      ListHeaderComponent={<StatusSummary counts={counts} />}
      renderItem={({ item }) => (
        <Pressable onPress={() => onTap(item)} style={styles.listItem}>
          <View style={[styles.listIconSlot, { backgroundColor: SERVICE_TYPE_COLORS[item.service_type] }]}>
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
              <Text style={[styles.listMeta, statusColor(item.status)]}>· {item.status}</Text>
              {item.external_ticket && <Text style={styles.listMeta}>· {item.external_ticket}</Text>}
            </View>
          </View>
        </Pressable>
      )}
    />
  );
}

function DamageSheet({
  report,
  onClose,
  onStatusChanged,
}: {
  report: MyDamage;
  onClose: () => void;
  onStatusChanged: () => void;
}) {
  const [updating, setUpdating] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [damageType, setDamageType] = useState<DamageType>(report.damage_type);
  const [description, setDescription] = useState(report.description ?? '');
  const [company, setCompany] = useState(report.affected_company ?? '');
  const [photoUrls, setPhotoUrls] = useState<string[]>(report.photo_urls);
  const [newPhotos, setNewPhotos] = useState<PickedPhoto[]>([]);

  const editable = report.status === 'reported';
  const totalPhotos = photoUrls.length + newPhotos.length;

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

  function addPhoto() {
    if (totalPhotos >= 5) {
      Alert.alert('Max photos', 'A report can have at most 5 photos.');
      return;
    }
    Alert.alert('Add photo', undefined, [
      {
        text: 'Camera',
        onPress: async () => {
          const p = await takePhotoWithPicker();
          if (p) setNewPhotos((prev) => [...prev, p]);
        },
      },
      {
        text: 'Gallery',
        onPress: async () => {
          const p = await pickFromGallery();
          if (p) setNewPhotos((prev) => [...prev, p]);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function removeExisting(url: string) {
    setPhotoUrls((prev) => prev.filter((u) => u !== url));
  }
  function removeNew(index: number) {
    setNewPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    if (totalPhotos === 0) {
      Alert.alert('No photos', 'A report needs at least one photo.');
      return;
    }
    setSaving(true);
    try {
      const uploadedUrls: string[] = [];
      for (const p of newPhotos) {
        const url = await uploadPhotoToStorage(p);
        uploadedUrls.push(url);
      }
      const finalUrls = [...photoUrls, ...uploadedUrls];
      const { error } = await supabase
        .from('reports')
        .update({
          damage_type: damageType,
          description: description.trim() || null,
          affected_company: company.trim() || null,
          photo_urls: finalUrls,
        })
        .eq('id', report.id);
      if (error) {
        Alert.alert('Save failed', error.message);
        return;
      }
      setEditing(false);
      setNewPhotos([]);
      onStatusChanged(); // triggers list refresh and closes sheet
    } catch (e: any) {
      Alert.alert('Save failed', e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.sheetBackdrop}>
      <Pressable style={styles.sheetBackdropTap} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <ScrollView contentContainerStyle={styles.sheetContent}>
          {editing ? (
            <>
              <Text style={styles.editLabel}>Photos ({totalPhotos}/5)</Text>
              <ScrollView horizontal contentContainerStyle={styles.photoStrip}>
                {photoUrls.map((u) => (
                  <View key={u} style={styles.photoThumbWrap}>
                    <Image source={{ uri: u }} style={styles.photoThumb} />
                    <Pressable
                      onPress={() => removeExisting(u)}
                      style={styles.photoRemoveBtn}
                      hitSlop={8}
                    >
                      <Text style={styles.photoRemoveText}>✕</Text>
                    </Pressable>
                  </View>
                ))}
                {newPhotos.map((p, i) => (
                  <View key={`${p.uri}-${i}`} style={styles.photoThumbWrap}>
                    <Image source={{ uri: p.uri }} style={styles.photoThumb} />
                    <Pressable
                      onPress={() => removeNew(i)}
                      style={styles.photoRemoveBtn}
                      hitSlop={8}
                    >
                      <Text style={styles.photoRemoveText}>✕</Text>
                    </Pressable>
                  </View>
                ))}
                {totalPhotos < 5 && (
                  <Pressable onPress={addPhoto} style={styles.addPhotoBtn}>
                    <Text style={styles.addPhotoPlus}>+</Text>
                    <Text style={styles.addPhotoLabel}>Add</Text>
                  </Pressable>
                )}
              </ScrollView>

              <Text style={styles.editLabel}>Damage type</Text>
              <View style={styles.chipWrap}>
                {(Object.keys(DAMAGE_TYPE_LABELS) as DamageType[]).map((type) => {
                  const active = damageType === type;
                  return (
                    <Pressable
                      key={type}
                      onPress={() => setDamageType(type)}
                      style={[
                        styles.editChip,
                        active && { backgroundColor: T.primary, borderColor: T.primary },
                      ]}
                    >
                      <DamageIcon
                        name={DAMAGE_TYPE_ICONS[type]}
                        size={14}
                        color={active ? T.bg : T.text}
                      />
                      <Text style={[styles.editChipText, active && styles.editChipTextActive]}>
                        {DAMAGE_TYPE_LABELS[type]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.editLabel}>Description</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="e.g. wire hanging low over driveway"
                placeholderTextColor={T.textDim}
                multiline
                maxLength={280}
                style={[styles.editInput, styles.editInputMulti]}
              />

              <Text style={styles.editLabel}>Affected company</Text>
              <TextInput
                value={company}
                onChangeText={setCompany}
                placeholder="e.g. Spectrum, AT&T"
                placeholderTextColor={T.textDim}
                autoCapitalize="words"
                style={styles.editInput}
              />

              <View style={styles.editActions}>
                <Pressable
                  onPress={() => {
                    setEditing(false);
                    setDamageType(report.damage_type);
                    setDescription(report.description ?? '');
                    setCompany(report.affected_company ?? '');
                    setPhotoUrls(report.photo_urls);
                    setNewPhotos([]);
                  }}
                  disabled={saving}
                  style={[styles.editBtn, styles.editBtnCancel]}
                >
                  <Text style={styles.editBtnCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleSave}
                  disabled={saving}
                  style={[styles.editBtn, styles.editBtnSave, saving && styles.statusBtnDisabled]}
                >
                  {saving ? (
                    <ActivityIndicator color={T.bg} />
                  ) : (
                    <Text style={styles.editBtnSaveText}>Save</Text>
                  )}
                </Pressable>
              </View>
            </>
          ) : (
            <>
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
                  <Text style={styles.damagePillText}>
                    {DAMAGE_TYPE_LABELS[report.damage_type]}
                  </Text>
                </View>
                <Text style={styles.sheetAge}>{timeAgo(report.created_at)}</Text>
              </View>
              {report.affected_company && (
                <Text style={styles.sheetMeta}>Service: {report.affected_company}</Text>
              )}
              {report.description && (
                <Text style={styles.sheetDescription}>{report.description}</Text>
              )}
              <Text style={styles.sheetMeta}>Status: {report.status}</Text>

              {editable && (
                <Pressable onPress={() => setEditing(true)} style={styles.editEntryBtn}>
                  <Text style={styles.editEntryBtnText}>Edit report</Text>
                </Pressable>
              )}

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

              <Pressable style={styles.sheetCloseBtn} onPress={onClose}>
                <Text style={styles.sheetCloseText}>Close</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

function OutageSheet({
  outage,
  onClose,
  onStatusChanged,
}: {
  outage: MyOutage;
  onClose: () => void;
  onStatusChanged: () => void;
}) {
  const [updating, setUpdating] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serviceType, setServiceType] = useState<ServiceType>(outage.service_type);
  const [provider, setProvider] = useState(outage.provider_company);
  const [description, setDescription] = useState(outage.description ?? '');
  const [ticket, setTicket] = useState(outage.external_ticket ?? '');

  const editable = outage.status === 'reported';

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

  async function handleSave() {
    if (!provider.trim()) {
      Alert.alert('Provider required', 'Please enter the provider or company name.');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('outage_reports')
      .update({
        service_type: serviceType,
        provider_company: provider.trim(),
        description: description.trim() || null,
        external_ticket: ticket.trim() || null,
      })
      .eq('id', outage.id);
    setSaving(false);
    if (error) {
      Alert.alert('Save failed', error.message);
      return;
    }
    setEditing(false);
    onStatusChanged();
  }

  return (
    <View style={styles.sheetBackdrop}>
      <Pressable style={styles.sheetBackdropTap} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <ScrollView contentContainerStyle={styles.sheetContent}>
          {editing ? (
            <>
              <Text style={styles.editLabel}>Service type</Text>
              <View style={styles.chipWrap}>
                {(Object.keys(SERVICE_TYPE_LABELS) as ServiceType[]).map((type) => {
                  const active = serviceType === type;
                  return (
                    <Pressable
                      key={type}
                      onPress={() => setServiceType(type)}
                      style={[
                        styles.editChip,
                        active && { backgroundColor: T.primary, borderColor: T.primary },
                      ]}
                    >
                      <DamageIcon
                        name={SERVICE_TYPE_ICONS[type]}
                        size={14}
                        color={active ? T.bg : T.text}
                      />
                      <Text style={[styles.editChipText, active && styles.editChipTextActive]}>
                        {SERVICE_TYPE_LABELS[type]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.editLabel}>Provider / company</Text>
              <TextInput
                value={provider}
                onChangeText={setProvider}
                placeholder="e.g. Spectrum, AT&T, FirstEnergy"
                placeholderTextColor={T.textDim}
                autoCapitalize="words"
                style={styles.editInput}
              />

              <Text style={styles.editLabel}>Description</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="e.g. Internet has been out since 2pm"
                placeholderTextColor={T.textDim}
                multiline
                maxLength={280}
                style={[styles.editInput, styles.editInputMulti]}
              />

              <Text style={styles.editLabel}>Provider ticket #</Text>
              <TextInput
                value={ticket}
                onChangeText={setTicket}
                placeholder="If you've already called it in"
                placeholderTextColor={T.textDim}
                autoCapitalize="characters"
                style={styles.editInput}
              />

              <View style={styles.editActions}>
                <Pressable
                  onPress={() => {
                    setEditing(false);
                    setServiceType(outage.service_type);
                    setProvider(outage.provider_company);
                    setDescription(outage.description ?? '');
                    setTicket(outage.external_ticket ?? '');
                  }}
                  disabled={saving}
                  style={[styles.editBtn, styles.editBtnCancel]}
                >
                  <Text style={styles.editBtnCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleSave}
                  disabled={saving}
                  style={[styles.editBtn, styles.editBtnSave, saving && styles.statusBtnDisabled]}
                >
                  {saving ? (
                    <ActivityIndicator color={T.bg} />
                  ) : (
                    <Text style={styles.editBtnSaveText}>Save</Text>
                  )}
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <View style={styles.sheetHeader}>
                <View
                  style={[styles.servicePill, { backgroundColor: SERVICE_TYPE_COLORS[outage.service_type] }]}
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

              {editable && (
                <Pressable onPress={() => setEditing(true)} style={styles.editEntryBtn}>
                  <Text style={styles.editEntryBtnText}>Edit outage</Text>
                </Pressable>
              )}

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

              <Pressable style={styles.sheetCloseBtn} onPress={onClose}>
                <Text style={styles.sheetCloseText}>Close</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

async function uploadPhotoToStorage(photo: PickedPhoto): Promise<string> {
  const base64 = await FileSystem.readAsStringAsync(photo.uri, { encoding: 'base64' });
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const filename = `edit/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${photo.ext}`;
  const contentType = `image/${photo.ext === 'jpg' ? 'jpeg' : 'png'}`;
  const { error } = await supabase.storage
    .from('report-photos')
    .upload(filename, bytes.buffer, { contentType, upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from('report-photos').getPublicUrl(filename);
  return data.publicUrl;
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

function statusColor(status: string) {
  if (status === 'resolved') return { color: T.success };
  if (status === 'invalid') return { color: T.textDim };
  if (status === 'dispatched' || status === 'confirmed') return { color: T.warning };
  return {};
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
  },
  headerBtn: { paddingVertical: T.space.xs, paddingHorizontal: T.space.sm, minWidth: 60 },
  headerBtnText: { color: T.primary, fontSize: T.font.sm, fontWeight: '600' },
  title: { color: T.text, fontSize: T.font.md, fontWeight: '700' },
  tabs: {
    flexDirection: 'row',
    backgroundColor: T.surfaceAlt,
    margin: T.space.md,
    borderRadius: T.radius.md,
    padding: 3,
    gap: 2,
  },
  tab: {
    flex: 1,
    paddingVertical: T.space.sm + 2,
    alignItems: 'center',
    borderRadius: T.radius.sm,
  },
  tabActive: { backgroundColor: T.primary },
  tabText: { color: T.textMuted, fontSize: T.font.sm, fontWeight: '600' },
  tabTextActive: { color: T.bg, fontWeight: '700' },
  banner: {
    backgroundColor: T.surfaceAlt,
    paddingHorizontal: T.space.lg,
    paddingVertical: T.space.sm,
  },
  bannerError: { backgroundColor: T.danger },
  bannerText: { color: T.text, fontSize: T.font.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: T.space.xl, gap: T.space.md },
  emptyText: { color: T.textMuted, fontSize: T.font.md, textAlign: 'center' },
  listContent: { padding: T.space.md, gap: T.space.md },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: T.space.xs,
    marginBottom: T.space.sm,
  },
  summaryPill: {
    paddingHorizontal: T.space.sm,
    paddingVertical: T.space.xs,
    borderRadius: T.radius.pill,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
  },
  summaryPillText: { color: T.textMuted, fontSize: T.font.xs, fontWeight: '600' },
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
  listProvider: { color: T.text, fontSize: T.font.md, fontWeight: '700' },
  listDescription: { color: T.text, fontSize: T.font.sm, lineHeight: 18 },
  listMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  listMeta: { color: T.textMuted, fontSize: T.font.xs },
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
  editEntryBtn: {
    alignItems: 'center',
    paddingVertical: T.space.sm,
  },
  editEntryBtnText: {
    color: T.primary,
    fontSize: T.font.sm,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  editLabel: { color: T.text, fontSize: T.font.sm, fontWeight: '600' },
  editInput: {
    backgroundColor: T.bg,
    borderColor: T.border,
    borderWidth: 1,
    borderRadius: T.radius.md,
    padding: T.space.md,
    color: T.text,
    fontSize: T.font.md,
  },
  editInputMulti: { minHeight: 80, textAlignVertical: 'top' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: T.space.xs },
  editChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: T.space.xs,
    paddingHorizontal: T.space.sm + 2,
    paddingVertical: T.space.xs + 2,
    borderRadius: T.radius.pill,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.bg,
  },
  editChipText: { color: T.text, fontSize: T.font.xs, fontWeight: '500' },
  editChipTextActive: { color: T.bg, fontWeight: '700' },
  editActions: { flexDirection: 'row', gap: T.space.sm, marginTop: T.space.md },
  editBtn: {
    flex: 1,
    paddingVertical: T.space.md,
    borderRadius: T.radius.md,
    alignItems: 'center',
  },
  editBtnCancel: {
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.bg,
  },
  editBtnCancelText: { color: T.text, fontSize: T.font.md, fontWeight: '600' },
  editBtnSave: { backgroundColor: T.primary },
  editBtnSaveText: { color: T.bg, fontSize: T.font.md, fontWeight: '700' },
  photoStrip: { gap: T.space.sm, paddingRight: T.space.md },
  photoThumbWrap: { position: 'relative', width: 100, aspectRatio: 4 / 3 },
  photoThumb: {
    width: '100%',
    height: '100%',
    borderRadius: T.radius.sm,
    backgroundColor: T.surfaceAlt,
  },
  photoRemoveBtn: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRemoveText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  addPhotoBtn: {
    width: 100,
    aspectRatio: 4 / 3,
    borderRadius: T.radius.sm,
    borderWidth: 1,
    borderColor: T.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.bg,
  },
  addPhotoPlus: { color: T.primary, fontSize: 28, fontWeight: '300' },
  addPhotoLabel: { color: T.textMuted, fontSize: T.font.xs },
});
