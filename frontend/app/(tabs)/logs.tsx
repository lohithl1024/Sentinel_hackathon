// this is team z
import { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth, apiGet } from "../../src/auth";
import { colors, mono, riskColor, riskBg, riskBorder } from "../../src/theme";

export default function Logs() {
  const { token } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);

  const load = useCallback(async () => {
    try { setLogs(await apiGet("/api/logs/all?limit=200", token)); }
    catch (e) { console.warn(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;

  return (
    <SafeAreaView style={styles.c} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>LOGIN EVENTS</Text>
        <Text style={styles.sub}>{logs.length} events</Text>
      </View>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        {logs.map((ev) => (
          <TouchableOpacity key={ev.event_id} testID={`log-${ev.event_id}`} onPress={() => setSelected(ev)}
            style={[styles.row, { borderLeftColor: riskColor(ev.risk_level) }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.email}>{ev.email}</Text>
              <Text style={styles.meta}>{new Date(ev.timestamp).toLocaleString()}</Text>
              <View style={styles.tagRow}>
                <Tag text={ev.features.device_type} />
                <Tag text={ev.features.geo_location} />
                <Tag text={`hour ${ev.features.login_hour}`} />
                {ev.simulated && <Tag text="SIM" accent />}
              </View>
            </View>
            <View style={styles.rightCol}>
              <Text style={[styles.score, { color: riskColor(ev.risk_level) }]}>{ev.risk_score}</Text>
              <View style={[styles.lvl, { backgroundColor: riskBg(ev.risk_level), borderColor: riskBorder(ev.risk_level) }]}>
                <Text style={[styles.lvlText, { color: riskColor(ev.risk_level) }]}>{ev.risk_level}</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Modal visible={!!selected} animationType="slide" transparent onRequestClose={() => setSelected(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modal}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>EVENT DETAIL</Text>
              <TouchableOpacity testID="close-modal" onPress={() => setSelected(null)}>
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            {selected && (
              <ScrollView>
                <Text style={styles.modalEmail}>{selected.email}</Text>
                <Text style={styles.modalMeta}>{new Date(selected.timestamp).toLocaleString()}</Text>
                <View style={{ flexDirection: "row", marginTop: 12, gap: 12 }}>
                  <View style={styles.kv}>
                    <Text style={styles.kvLabel}>RISK</Text>
                    <Text style={[styles.kvVal, { color: riskColor(selected.risk_level) }]}>{selected.risk_score}</Text>
                  </View>
                  <View style={styles.kv}>
                    <Text style={styles.kvLabel}>ANOMALY</Text>
                    <Text style={styles.kvVal}>{selected.anomaly_score.toFixed(3)}</Text>
                  </View>
                  <View style={styles.kv}>
                    <Text style={styles.kvLabel}>ACTION</Text>
                    <Text style={[styles.kvVal, { fontSize: 14 }]}>{selected.action}</Text>
                  </View>
                </View>
                <Text style={styles.sectionLabel}>EXPLANATION</Text>
                {selected.explanation.map((r: string, i: number) => (
                  <View key={i} style={styles.reasonRow}>
                    <Ionicons name="alert-circle" size={14} color={riskColor(selected.risk_level)} />
                    <Text style={styles.reasonText}>{r}</Text>
                  </View>
                ))}
                <Text style={styles.sectionLabel}>FEATURES</Text>
                {Object.entries(selected.features).map(([k, v]) => (
                  <View key={k} style={styles.featRow}>
                    <Text style={styles.featKey}>{k}</Text>
                    <Text style={styles.featVal}>{String(v)}</Text>
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

const Tag = ({ text, accent }: { text: string; accent?: boolean }) => (
  <View style={[styles.tag, accent && { borderColor: colors.accent, backgroundColor: "rgba(139,92,246,0.1)" }]}>
    <Text style={[styles.tagText, accent && { color: colors.accent }]}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  header: { paddingHorizontal: 16, paddingBottom: 12 },
  title: { color: colors.textPrimary, fontSize: 22, fontWeight: "700", letterSpacing: 1 },
  sub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  row: { flexDirection: "row", marginHorizontal: 16, marginBottom: 10, backgroundColor: colors.card, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 3, alignItems: "center" },
  email: { color: colors.textPrimary, fontSize: 14, fontFamily: mono },
  meta: { color: colors.textTertiary, fontSize: 11, marginTop: 3 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 8 },
  tag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: "#0F0F0F" },
  tagText: { color: colors.textSecondary, fontSize: 10, fontFamily: mono },
  rightCol: { alignItems: "flex-end", gap: 6 },
  score: { fontSize: 26, fontFamily: mono, fontWeight: "700" },
  lvl: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
  lvlText: { fontSize: 9, fontWeight: "700", letterSpacing: 1 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modal: { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: "85%", borderWidth: 1, borderColor: colors.border },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  modalTitle: { color: colors.textTertiary, fontSize: 11, letterSpacing: 2, fontWeight: "700" },
  modalEmail: { color: colors.textPrimary, fontSize: 18, fontWeight: "700", fontFamily: mono },
  modalMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 3 },
  kv: { flex: 1, backgroundColor: "#0F0F0F", borderRadius: 8, padding: 10, borderWidth: 1, borderColor: colors.border },
  kvLabel: { color: colors.textTertiary, fontSize: 9, letterSpacing: 1, fontWeight: "700" },
  kvVal: { color: colors.textPrimary, fontSize: 20, fontFamily: mono, marginTop: 4, fontWeight: "700" },
  sectionLabel: { color: colors.textTertiary, fontSize: 10, letterSpacing: 2, marginTop: 18, marginBottom: 8, fontWeight: "700" },
  reasonRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  reasonText: { color: colors.textSecondary, fontSize: 12 },
  featRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: colors.border },
  featKey: { color: colors.textTertiary, fontSize: 11, fontFamily: mono },
  featVal: { color: colors.textPrimary, fontSize: 11, fontFamily: mono },
});
