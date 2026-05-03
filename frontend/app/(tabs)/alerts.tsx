// this is team z
import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth, apiGet } from "../../src/auth";
import { colors, mono } from "../../src/theme";

export default function Alerts() {
  const { token } = useAuth();
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setAlerts(await apiGet("/api/alerts?limit=100", token)); }
    catch (e) { console.warn(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;

  return (
    <SafeAreaView style={styles.c} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>HIGH-RISK ALERTS</Text>
        <Text style={styles.sub}>{alerts.length} active alert{alerts.length !== 1 ? "s" : ""}</Text>
      </View>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        {alerts.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="shield-checkmark" size={48} color={colors.low} />
            <Text style={styles.emptyText}>No high-risk events detected</Text>
            <Text style={styles.emptySub}>Trigger the Simulate tab to see alerts in action.</Text>
          </View>
        )}
        {alerts.map((a) => (
          <View key={a.alert_id} testID={`alert-${a.alert_id}`} style={styles.alert}>
            <View style={styles.alertHead}>
              <Ionicons name="warning" size={20} color={colors.high} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.email}>{a.email}</Text>
                <Text style={styles.ts}>{new Date(a.timestamp).toLocaleString()}</Text>
              </View>
              <Text style={styles.score}>{a.risk_score}</Text>
            </View>
            <View style={styles.chipRow}>
              {(a.reason || []).map((r: string, i: number) => (
                <View key={i} style={styles.chip}>
                  <Text style={styles.chipText}>{r}</Text>
                </View>
              ))}
            </View>
            {a.simulated && (
              <View style={styles.simTag}>
                <Text style={styles.simText}>SIMULATED</Text>
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  header: { paddingHorizontal: 16, paddingBottom: 12 },
  title: { color: colors.textPrimary, fontSize: 22, fontWeight: "700", letterSpacing: 1 },
  sub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  empty: { alignItems: "center", marginTop: 80 },
  emptyText: { color: colors.textPrimary, fontSize: 15, fontWeight: "600", marginTop: 14 },
  emptySub: { color: colors.textSecondary, fontSize: 12, marginTop: 6, textAlign: "center" },
  alert: { backgroundColor: colors.highBg, borderColor: colors.highBorder, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 12 },
  alertHead: { flexDirection: "row", alignItems: "center" },
  email: { color: colors.textPrimary, fontSize: 14, fontWeight: "700", fontFamily: mono },
  ts: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  score: { color: colors.high, fontSize: 28, fontFamily: mono, fontWeight: "700" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16, borderWidth: 1, borderColor: colors.highBorder, backgroundColor: "rgba(239,68,68,0.05)" },
  chipText: { color: colors.high, fontSize: 11 },
  simTag: { alignSelf: "flex-start", marginTop: 10, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: "rgba(139,92,246,0.15)", borderRadius: 4, borderWidth: 1, borderColor: colors.accent },
  simText: { color: colors.accent, fontSize: 9, fontWeight: "700", letterSpacing: 2 },
});
