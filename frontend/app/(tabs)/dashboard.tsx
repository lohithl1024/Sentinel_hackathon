import { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth, apiGet } from "../../src/auth";
import { colors, mono, riskColor, riskBg, riskBorder } from "../../src/theme";

type Event = {
  event_id: string; timestamp: string; risk_score: number; risk_level: string;
  action: string; explanation: string[]; features: any; anomaly_score: number;
  login_status: string; email?: string;
};

export default function Dashboard() {
  const { user, token, logout } = useAuth();
  const isSecurity = user?.role === "security_team";
  const router = useRouter();
  const [logs, setLogs] = useState<Event[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [ai, setAi] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const requests = [
        apiGet("/api/logs/all?limit=50", token),
        apiGet("/api/alerts?limit=20", token),
        ...(isSecurity ? [] : [apiGet("/api/ai/analytics", token)]),
      ];
      const [l, a, aiStats] = await Promise.allSettled(requests);
      if (l.status === "fulfilled") setLogs(l.value);
      if (a.status === "fulfilled") setAlerts(a.value);
      if (!isSecurity && aiStats?.status === "fulfilled") setAi(aiStats.value);
      if (isSecurity) setAi(null);
    } catch (e) { console.warn(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [isSecurity, token]);

  useEffect(() => { load(); }, [load]);

  const latest = logs[0];
  const highCount = logs.filter(l => l.risk_level === "HIGH").length;
  const medCount = logs.filter(l => l.risk_level === "MEDIUM").length;

  const onLogout = async () => { await logout(); router.replace("/login"); };

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;

  return (
    <SafeAreaView style={styles.c} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.hello}>Welcome back</Text>
          <Text testID="dashboard-user" style={styles.userName}>{user?.name || user?.email}</Text>
        </View>
        <TouchableOpacity testID="logout-btn" onPress={onLogout} style={styles.iconBtn}>
          <Ionicons name="log-out-outline" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        {!isSecurity && ai && (
          <View style={styles.aiPanel}>
            <View style={styles.aiHead}>
              <View>
                <Text style={styles.cardLabel}>AI DEFENSE POSTURE</Text>
                <Text style={styles.aiTitle}>Prompt Firewall Active</Text>
              </View>
              <Ionicons name="shield-checkmark" size={28} color={colors.primary} />
            </View>
            <View style={styles.aiGrid}>
              <StatCard label="AI EVENTS" value={String(ai.total_events || 0)} color={colors.primary} icon="chatbubbles" />
              <StatCard label="RULE HITS" value={String(ai.rule_hits || 0)} color={colors.medium} icon="bug" />
              <StatCard label="BLOCKS" value={String((ai.action_distribution?.BLOCK || 0) + (ai.action_distribution?.BLOCK_AND_QUEUE_APPROVAL || 0))} color={colors.critical} icon="ban" />
            </View>
            <View style={styles.aiLevelRow}>
              {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((level) => (
                <View key={level} style={[styles.aiLevel, { borderColor: riskBorder(level), backgroundColor: riskBg(level) }]}>
                  <Text style={[styles.aiLevelValue, { color: riskColor(level) }]}>{ai.level_distribution?.[level] || 0}</Text>
                  <Text style={styles.aiLevelLabel}>{level}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Latest risk card */}
        {latest && (
          <View testID="latest-risk-card" style={[styles.riskCard, { borderColor: riskBorder(latest.risk_level), backgroundColor: riskBg(latest.risk_level) }]}>
            <View style={styles.row}>
              <View>
                <Text style={styles.cardLabel}>LATEST RISK</Text>
                <Text style={styles.riskLevel}>{latest.risk_level}</Text>
              </View>
              <Text testID="latest-risk-score" style={[styles.riskScore, { color: riskColor(latest.risk_level) }]}>{latest.risk_score}</Text>
            </View>
            <Text style={styles.actionText}>Action: <Text style={{ color: riskColor(latest.risk_level), fontWeight: "700" }}>{latest.action}</Text></Text>
            <View style={styles.chipRow}>
              {latest.explanation.slice(0, 3).map((r, i) => (
                <View key={i} style={[styles.chip, { borderColor: riskBorder(latest.risk_level) }]}>
                  <Text style={[styles.chipText, { color: riskColor(latest.risk_level) }]}>{r}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Stat row */}
        <View style={styles.statRow}>
          <StatCard testID="stat-total" label="TOTAL EVENTS" value={String(logs.length)} color={colors.primary} icon="pulse" />
          <StatCard testID="stat-high" label="HIGH RISK" value={String(highCount)} color={colors.high} icon="alert-circle" />
          <StatCard testID="stat-med" label="MEDIUM" value={String(medCount)} color={colors.medium} icon="warning" />
        </View>

        {/* Recent events */}
        <Text style={styles.sectionTitle}>SUPPORTING LOGIN ACTIVITY</Text>
        {logs.slice(0, 8).map((ev) => (
          <View key={ev.event_id} style={styles.evRow} testID={`ev-${ev.event_id}`}>
            <View style={[styles.dot, { backgroundColor: riskColor(ev.risk_level) }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.evEmail}>{ev.email}</Text>
              <Text style={styles.evMeta}>
                {new Date(ev.timestamp).toLocaleString()} · {ev.features.device_type} · {ev.features.geo_location}
              </Text>
            </View>
            <Text style={[styles.evScore, { color: riskColor(ev.risk_level) }]}>{ev.risk_score}</Text>
          </View>
        ))}

        {alerts.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>ACTIVE ALERTS</Text>
            {alerts.slice(0, 3).map((a) => (
              <View key={a.alert_id} style={styles.alertBox}>
                <Ionicons name="warning" size={18} color={colors.high} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.alertEmail}>{a.email} · risk {a.risk_score}</Text>
                  <Text style={styles.alertReason} numberOfLines={2}>{(a.reason || []).join(" • ")}</Text>
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ label, value, color, icon, testID }: any) {
  return (
    <View style={styles.stat} testID={testID}>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12 },
  hello: { color: colors.textSecondary, fontSize: 12 },
  userName: { color: colors.textPrimary, fontSize: 18, fontWeight: "700" },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  riskCard: { marginHorizontal: 16, borderWidth: 1, borderRadius: 16, padding: 20, marginBottom: 16 },
  aiPanel: { marginHorizontal: 16, backgroundColor: colors.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 16 },
  aiHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  aiTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: "700", marginTop: 4 },
  aiGrid: { flexDirection: "row", gap: 8 },
  aiLevelRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  aiLevel: { flex: 1, borderRadius: 8, borderWidth: 1, paddingVertical: 8, alignItems: "center" },
  aiLevelValue: { fontSize: 18, fontFamily: mono, fontWeight: "700" },
  aiLevelLabel: { color: colors.textTertiary, fontSize: 8, letterSpacing: 1, marginTop: 2, fontWeight: "700" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardLabel: { color: colors.textTertiary, fontSize: 10, letterSpacing: 2, fontWeight: "700" },
  riskLevel: { color: colors.textPrimary, fontSize: 22, fontWeight: "700", marginTop: 4 },
  riskScore: { fontSize: 56, fontFamily: mono, fontWeight: "700" },
  actionText: { color: colors.textSecondary, fontSize: 13, marginTop: 12, fontFamily: mono },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16, borderWidth: 1 },
  chipText: { fontSize: 11 },
  statRow: { flexDirection: "row", paddingHorizontal: 16, gap: 8, marginBottom: 4 },
  stat: { flex: 1, backgroundColor: colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border },
  statLabel: { color: colors.textTertiary, fontSize: 9, letterSpacing: 1, fontWeight: "700", marginTop: 6 },
  statValue: { fontSize: 24, fontFamily: mono, fontWeight: "700", marginTop: 4 },
  sectionTitle: { color: colors.textTertiary, fontSize: 10, letterSpacing: 2, fontWeight: "700", paddingHorizontal: 16, marginTop: 22, marginBottom: 10 },
  evRow: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.card, gap: 10 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  evEmail: { color: colors.textPrimary, fontSize: 13, fontFamily: mono },
  evMeta: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },
  evScore: { fontSize: 18, fontFamily: mono, fontWeight: "700" },
  alertBox: { flexDirection: "row", marginHorizontal: 16, padding: 12, backgroundColor: colors.highBg, borderWidth: 1, borderColor: colors.highBorder, borderRadius: 10, marginBottom: 8, alignItems: "center" },
  alertEmail: { color: colors.textPrimary, fontSize: 13, fontWeight: "600" },
  alertReason: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
});
