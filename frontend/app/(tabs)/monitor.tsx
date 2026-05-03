// this is team z
import { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  ActivityIndicator, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth, apiGet, apiPost } from "../../src/auth";
import { colors, mono } from "../../src/theme";

type Session = {
  user_id: string; email: string; name?: string; role: string; shift: string;
  session_id: string; session_duration_min: number; data_accessed_mb: number;
  file_operations: { reads: number; writes: number; deletes: number };
  file_operations_total: number; location: string; device: string; ip_address: string;
  recent_files: string[]; location_history: { location: string; t: string }[];
  started_at: string;
};

type Detail = Session & { recent_events: any[] };

const formatDuration = (m: number) => {
  const h = Math.floor(m / 60);
  const min = Math.round(m % 60);
  return h > 0 ? `${h}h ${min}m` : `${min}m`;
};

export default function Monitor() {
  const { user, token } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshingMetrics, setRefreshingMetrics] = useState(false);
  const [selected, setSelected] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setSessions(await apiGet("/api/monitoring/users", token)); setErr(null); }
    catch (e: any) { setErr(e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, [token]);

  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  const openDetail = async (s: Session) => {
    try {
      const d = await apiGet(`/api/monitoring/users/${s.user_id}`, token);
      setSelected(d);
    } catch (e: any) { setErr(e.message); }
  };

  const refreshMetrics = async () => {
    setRefreshingMetrics(true);
    try {
      await apiPost("/api/monitoring/refresh", {}, token);
      await load();
    } catch (e: any) { setErr(e.message); }
    finally { setRefreshingMetrics(false); }
  };

  if (user?.role !== "security_team") {
    return (
      <SafeAreaView style={styles.c}>
        <View style={styles.denied}>
          <Ionicons name="lock-closed" size={48} color={colors.textTertiary} />
          <Text style={styles.deniedText}>Security team role required</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;

  return (
    <SafeAreaView style={styles.c} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>CONTINUOUS MONITORING</Text>
          <Text style={styles.sub}>Live user activity · {sessions.length} active sessions</Text>
        </View>
        <TouchableOpacity
          testID="monitor-refresh-btn"
          onPress={refreshMetrics}
          disabled={refreshingMetrics}
          style={styles.refreshBtn}
        >
          {refreshingMetrics
            ? <ActivityIndicator size="small" color={colors.primary} />
            : <Ionicons name="refresh" size={18} color={colors.primary} />}
          <Text style={styles.refreshText}>REFRESH</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        {err && <Text style={styles.err}>{err}</Text>}
        {sessions.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="eye-off-outline" size={48} color={colors.textTertiary} />
            <Text style={styles.emptyText}>No active sessions</Text>
          </View>
        )}
        {sessions.map((s) => (
          <TouchableOpacity
            key={s.session_id}
            testID={`monitor-user-${s.email.split("@")[0]}`}
            style={styles.card}
            onPress={() => openDetail(s)}
          >
            <View style={styles.cardHead}>
              <View style={styles.avatar}>
                <Ionicons name="person" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.email}>{s.name || s.email}</Text>
                <Text style={styles.meta}>{s.email} · {s.role.replace("_", " ")} · {s.shift}</Text>
              </View>
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            </View>

            <View style={styles.metricGrid}>
              <Metric
                testID={`metric-duration-${s.email.split("@")[0]}`}
                icon="time-outline"
                label="SESSION DURATION"
                value={formatDuration(s.session_duration_min)}
                color={colors.primary}
              />
              <Metric
                testID={`metric-data-${s.email.split("@")[0]}`}
                icon="cloud-download-outline"
                label="DATA ACCESSED"
                value={`${s.data_accessed_mb} MB`}
                color={colors.accent}
              />
              <Metric
                testID={`metric-ops-${s.email.split("@")[0]}`}
                icon="document-text-outline"
                label="FILE OPERATIONS"
                value={String(s.file_operations_total)}
                sub={`${s.file_operations.reads}R · ${s.file_operations.writes}W · ${s.file_operations.deletes}D`}
                color={s.file_operations.deletes > 2 ? colors.high : colors.low}
              />
              <Metric
                testID={`metric-loc-${s.email.split("@")[0]}`}
                icon="location-outline"
                label="LOCATION"
                value={s.location}
                sub={s.ip_address}
                color={colors.medium}
                small
              />
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Modal visible={!!selected} animationType="slide" transparent onRequestClose={() => setSelected(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modal}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>ACTIVITY DETAIL</Text>
              <TouchableOpacity testID="monitor-close" onPress={() => setSelected(null)}>
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            {selected && (
              <ScrollView>
                <Text style={styles.modalEmail}>{selected.name || selected.email}</Text>
                <Text style={styles.modalMeta}>{selected.email} · {selected.role.replace("_", " ")} ({selected.shift})</Text>

                <View style={styles.detailGrid}>
                  <DetailTile label="DURATION" value={formatDuration(selected.session_duration_min)} icon="time-outline" />
                  <DetailTile label="DATA" value={`${selected.data_accessed_mb} MB`} icon="cloud-download-outline" />
                  <DetailTile label="OPS" value={String(selected.file_operations_total)} icon="document-text-outline" />
                  <DetailTile label="LOCATION" value={selected.location} icon="location-outline" />
                </View>

                <Text style={styles.sectionLabel}>FILE OPERATIONS BREAKDOWN</Text>
                <View style={styles.opRow}>
                  <OpCell label="READS" value={selected.file_operations.reads} color={colors.low} />
                  <OpCell label="WRITES" value={selected.file_operations.writes} color={colors.medium} />
                  <OpCell label="DELETES" value={selected.file_operations.deletes} color={colors.high} />
                </View>

                <Text style={styles.sectionLabel}>RECENT FILES ACCESSED</Text>
                {selected.recent_files.map((f, i) => (
                  <View key={i} style={styles.fileRow}>
                    <Ionicons name="document-outline" size={14} color={colors.textSecondary} />
                    <Text style={styles.filePath}>{f}</Text>
                  </View>
                ))}

                <Text style={styles.sectionLabel}>LOCATION HISTORY</Text>
                {selected.location_history.length === 0 && (
                  <Text style={styles.emptyInline}>No movement this session.</Text>
                )}
                {selected.location_history.map((h, i) => (
                  <View key={i} style={styles.locRow}>
                    <Ionicons name="location" size={14} color={colors.medium} />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={styles.locText}>{h.location}</Text>
                      <Text style={styles.locTime}>{new Date(h.t).toLocaleString()}</Text>
                    </View>
                  </View>
                ))}

                <Text style={styles.sectionLabel}>RECENT LOGIN EVENTS</Text>
                {(selected.recent_events || []).slice(0, 5).map((ev: any) => (
                  <View key={ev.event_id} style={styles.evRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.evText}>{ev.action} · risk {ev.risk_score}</Text>
                      <Text style={styles.evTime}>{new Date(ev.timestamp).toLocaleString()}</Text>
                    </View>
                    <View style={[styles.evBadge, { borderColor: badgeColor(ev.risk_level) }]}>
                      <Text style={[styles.evBadgeText, { color: badgeColor(ev.risk_level) }]}>{ev.risk_level}</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function badgeColor(l: string) {
  if (l === "HIGH") return colors.high;
  if (l === "MEDIUM") return colors.medium;
  return colors.low;
}

const Metric = ({ icon, label, value, sub, color, small, testID }: any) => (
  <View style={styles.metric} testID={testID}>
    <View style={styles.metricHead}>
      <Ionicons name={icon} size={14} color={color} />
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
    <Text style={[styles.metricValue, { color }, small && { fontSize: 14 }]} numberOfLines={1}>{value}</Text>
    {sub && <Text style={styles.metricSub} numberOfLines={1}>{sub}</Text>}
  </View>
);

const DetailTile = ({ label, value, icon }: any) => (
  <View style={styles.detailTile}>
    <Ionicons name={icon} size={16} color={colors.primary} />
    <Text style={styles.detailLabel}>{label}</Text>
    <Text style={styles.detailValue} numberOfLines={1}>{value}</Text>
  </View>
);

const OpCell = ({ label, value, color }: any) => (
  <View style={[styles.opCell, { borderColor: color + "55" }]}>
    <Text style={[styles.opValue, { color }]}>{value}</Text>
    <Text style={styles.opLabel}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  denied: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30 },
  deniedText: { color: colors.textSecondary, fontSize: 14, marginTop: 14 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12 },
  title: { color: colors.textPrimary, fontSize: 20, fontWeight: "700", letterSpacing: 1 },
  sub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  refreshBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 6, borderWidth: 1, borderColor: colors.primary, backgroundColor: "rgba(59,130,246,0.1)" },
  refreshText: { color: colors.primary, fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  empty: { alignItems: "center", paddingVertical: 60 },
  emptyText: { color: colors.textPrimary, fontSize: 15, marginTop: 14 },
  err: { color: colors.high, fontSize: 12, fontFamily: mono, marginBottom: 12 },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  cardHead: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(59,130,246,0.15)", alignItems: "center", justifyContent: "center", marginRight: 10 },
  email: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  meta: { color: colors.textSecondary, fontSize: 11, marginTop: 2, fontFamily: mono },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10, backgroundColor: "rgba(16,185,129,0.15)", borderWidth: 1, borderColor: colors.lowBorder },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.low },
  liveText: { color: colors.low, fontSize: 9, fontWeight: "700", letterSpacing: 1 },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metric: { width: "48%", backgroundColor: "#0F0F0F", borderRadius: 8, padding: 10, borderWidth: 1, borderColor: colors.border },
  metricHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  metricLabel: { color: colors.textTertiary, fontSize: 9, letterSpacing: 1, fontWeight: "700" },
  metricValue: { color: colors.textPrimary, fontSize: 18, fontFamily: mono, fontWeight: "700" },
  metricSub: { color: colors.textTertiary, fontSize: 10, marginTop: 3, fontFamily: mono },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modal: { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: "90%", borderWidth: 1, borderColor: colors.border },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  modalTitle: { color: colors.textTertiary, fontSize: 11, letterSpacing: 2, fontWeight: "700" },
  modalEmail: { color: colors.textPrimary, fontSize: 20, fontWeight: "700" },
  modalMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 3, fontFamily: mono },
  detailGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 18 },
  detailTile: { width: "48%", backgroundColor: "#0F0F0F", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border },
  detailLabel: { color: colors.textTertiary, fontSize: 9, letterSpacing: 1, fontWeight: "700", marginTop: 6 },
  detailValue: { color: colors.textPrimary, fontSize: 15, fontFamily: mono, fontWeight: "700", marginTop: 4 },
  sectionLabel: { color: colors.textTertiary, fontSize: 10, letterSpacing: 2, marginTop: 20, marginBottom: 8, fontWeight: "700" },
  opRow: { flexDirection: "row", gap: 8 },
  opCell: { flex: 1, backgroundColor: "#0F0F0F", borderRadius: 8, padding: 14, borderWidth: 1, alignItems: "center" },
  opValue: { fontSize: 26, fontFamily: mono, fontWeight: "700" },
  opLabel: { color: colors.textTertiary, fontSize: 10, letterSpacing: 1, fontWeight: "700", marginTop: 4 },
  fileRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  filePath: { color: colors.textSecondary, fontSize: 12, fontFamily: mono, flex: 1 },
  emptyInline: { color: colors.textTertiary, fontSize: 12 },
  locRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  locText: { color: colors.textPrimary, fontSize: 12, fontFamily: mono },
  locTime: { color: colors.textTertiary, fontSize: 10, marginTop: 2 },
  evRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 8 },
  evText: { color: colors.textPrimary, fontSize: 12, fontFamily: mono },
  evTime: { color: colors.textTertiary, fontSize: 10, marginTop: 2 },
  evBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
  evBadgeText: { fontSize: 9, fontWeight: "700", letterSpacing: 1 },
});
