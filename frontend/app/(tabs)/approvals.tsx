import { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  ActivityIndicator, Modal, TextInput, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth, apiGet, apiPost } from "../../src/auth";
import { colors, mono, riskColor, riskBg, riskBorder } from "../../src/theme";

type ApprovalReq = {
  request_id: string; event_id: string; email: string; name?: string;
  role: string; shift: string; risk_score: number; anomaly_score: number;
  reason: string[]; features: any; status: string; created_at: string;
  reviewed_by?: { email: string }; reviewed_at?: string; review_note?: string;
  request_kind?: string; ai_prompt_redacted?: string; conversation_id?: string;
};

export default function Approvals() {
  const { user, token } = useAuth();
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const [rows, setRows] = useState<ApprovalReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<ApprovalReq | null>(null);
  const [note, setNote] = useState("");
  const [acting, setActing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const path = tab === "pending" ? "/api/approvals/pending" : "/api/approvals/all";
      setRows(await apiGet(path, token));
    } catch (e: any) {
      setErr(e.message);
    } finally { setLoading(false); setRefreshing(false); }
  }, [token, tab]);

  useEffect(() => { load(); }, [load]);

  const act = async (decision: "approve" | "reject") => {
    if (!selected) return;
    setActing(true); setErr(null);
    try {
      await apiPost(`/api/approvals/${selected.request_id}/${decision}`, { note: note || null }, token);
      setSelected(null); setNote("");
      load();
    } catch (e: any) {
      setErr(e.message);
      Alert.alert("Error", e.message);
    } finally { setActing(false); }
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

  const pendingCount = rows.filter(r => r.status === "pending").length;

  return (
    <SafeAreaView style={styles.c} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>APPROVAL QUEUE</Text>
        <Text style={styles.sub}>{pendingCount} pending · acting as {user.email}</Text>
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity testID="tab-pending" onPress={() => setTab("pending")}
          style={[styles.tab, tab === "pending" && styles.tabActive]}>
          <Text style={[styles.tabText, tab === "pending" && { color: colors.primary }]}>PENDING</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="tab-all" onPress={() => setTab("all")}
          style={[styles.tab, tab === "all" && styles.tabActive]}>
          <Text style={[styles.tabText, tab === "all" && { color: colors.primary }]}>ALL HISTORY</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        {rows.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="checkmark-done-circle-outline" size={48} color={colors.low} />
            <Text style={styles.emptyText}>No approval requests</Text>
            <Text style={styles.emptySub}>Trigger a HIGH risk login (e.g. login with simulate=[new_location,new_device]) to see a request here.</Text>
          </View>
        )}
        {rows.map((r) => (
          <TouchableOpacity key={r.request_id} testID={`approval-${r.request_id}`}
            style={[styles.row, { borderLeftColor: statusColor(r.status) }]}
            onPress={() => { setSelected(r); setNote(""); setErr(null); }}>
            <View style={{ flex: 1 }}>
              <View style={styles.topLine}>
                <Text style={styles.email}>{r.email}</Text>
                <StatusPill status={r.status} />
              </View>
              <View style={styles.metaRow}>
                <Badge text={r.request_kind === "ai_prompt" ? "AI prompt" : "login"} />
                <Badge text={r.role.replace("_", " ")} />
                <Badge text={r.shift} />
                <Text style={styles.ts}>{new Date(r.created_at).toLocaleString()}</Text>
              </View>
              <View style={styles.reasonRow}>
                {r.reason.slice(0, 2).map((x, i) => (
                  <View key={i} style={styles.reasonChip}>
                    <Text style={styles.reasonChipText}>{x}</Text>
                  </View>
                ))}
              </View>
            </View>
            <Text style={[styles.score, { color: riskColor("HIGH") }]}>{r.risk_score}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Modal visible={!!selected} animationType="slide" transparent onRequestClose={() => setSelected(null)}>
        <View style={styles.modalBg}>
          <View style={[styles.modal, { borderColor: riskBorder("HIGH"), backgroundColor: colors.card }]}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>APPROVAL REQUEST</Text>
              <TouchableOpacity testID="approval-close" onPress={() => setSelected(null)}>
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            {selected && (
              <ScrollView>
                <Text style={styles.modalEmail}>{selected.name || selected.email}</Text>
                <Text style={styles.modalMeta}>{selected.email} · {selected.role.replace("_", " ")} · {selected.shift} shift</Text>

                <View style={[styles.riskBox, { backgroundColor: riskBg("HIGH"), borderColor: riskBorder("HIGH") }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.riskLabel}>RISK SCORE</Text>
                    <Text style={styles.riskVal}>{selected.risk_score}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.riskLabel}>ANOMALY</Text>
                    <Text style={[styles.riskVal, { fontSize: 22 }]}>{selected.anomaly_score.toFixed(2)}</Text>
                  </View>
                </View>

                <Text style={styles.sectionLabel}>EXPLANATION</Text>
                {selected.reason.map((r, i) => (
                  <View key={i} style={styles.reasonLine}>
                    <Ionicons name="alert-circle" size={14} color={colors.high} />
                    <Text style={styles.reasonText}>{r}</Text>
                  </View>
                ))}

                <Text style={styles.sectionLabel}>CONTEXT</Text>
                {selected.request_kind === "ai_prompt" ? (
                  <>
                    <Row k="Type" v="AI prompt defense" />
                    <Row k="Conversation" v={selected.conversation_id || "-"} />
                    <Row k="Rule hits" v={String(selected.features?.rule_hits ?? 0)} />
                    <Row k="Approx tokens" v={String(selected.features?.approx_tokens ?? 0)} />
                    <Text style={styles.promptPreview}>{selected.ai_prompt_redacted || "Prompt hidden"}</Text>
                  </>
                ) : (
                  <>
                    <Row k="Login hour" v={String(selected.features.login_hour)} />
                    <Row k="Device" v={selected.features.device_type} />
                    <Row k="Location" v={selected.features.geo_location} />
                    <Row k="IP" v={selected.features.ip_address} />
                    <Row k="Failed attempts" v={String(selected.features.failed_attempts)} />
                  </>
                )}

                {selected.status === "pending" ? (
                  <>
                    <Text style={styles.sectionLabel}>DECISION NOTE (optional)</Text>
                    <TextInput
                      testID="approval-note"
                      value={note} onChangeText={setNote}
                      placeholder="Short justification for the audit log"
                      placeholderTextColor={colors.textTertiary}
                      style={styles.noteInput} multiline
                    />
                    {err && <Text style={styles.err}>{err}</Text>}
                    <View style={styles.actionRow}>
                      <TouchableOpacity testID="approval-reject-btn" disabled={acting}
                        style={[styles.actBtn, { backgroundColor: colors.high }]} onPress={() => act("reject")}>
                        {acting ? <ActivityIndicator color="#fff" /> : <Text style={styles.actText}>REJECT</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity testID="approval-approve-btn" disabled={acting}
                        style={[styles.actBtn, { backgroundColor: colors.low }]} onPress={() => act("approve")}>
                        {acting ? <ActivityIndicator color="#fff" /> : <Text style={styles.actText}>APPROVE</Text>}
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <View style={styles.decisionBox}>
                    <Text style={styles.sectionLabel}>DECISION</Text>
                    <StatusPill status={selected.status} big />
                    {selected.reviewed_by && (
                      <Text style={styles.decisionBy}>by {selected.reviewed_by.email} · {selected.reviewed_at ? new Date(selected.reviewed_at).toLocaleString() : ""}</Text>
                    )}
                    {selected.review_note && <Text style={styles.decisionNote}>"{selected.review_note}"</Text>}
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function statusColor(s: string) {
  if (s === "approved") return colors.low;
  if (s === "rejected") return colors.high;
  return colors.medium;
}

const StatusPill = ({ status, big }: { status: string; big?: boolean }) => (
  <View style={[{
    paddingHorizontal: big ? 14 : 8, paddingVertical: big ? 6 : 3,
    borderRadius: 4, borderWidth: 1, alignSelf: "flex-start",
    backgroundColor: statusColor(status) + "20", borderColor: statusColor(status),
  }]}>
    <Text style={{ color: statusColor(status), fontSize: big ? 13 : 9, fontWeight: "700", letterSpacing: 1 }}>
      {status.toUpperCase()}
    </Text>
  </View>
);

const Badge = ({ text }: { text: string }) => (
  <View style={styles.badge}><Text style={styles.badgeText}>{text}</Text></View>
);

const Row = ({ k, v }: any) => (
  <View style={styles.kvRow}>
    <Text style={styles.kvKey}>{k}</Text>
    <Text style={styles.kvVal}>{String(v)}</Text>
  </View>
);

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  denied: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30 },
  deniedText: { color: colors.textSecondary, fontSize: 14, marginTop: 14 },
  header: { paddingHorizontal: 16, paddingBottom: 10 },
  title: { color: colors.textPrimary, fontSize: 22, fontWeight: "700", letterSpacing: 1 },
  sub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  tabRow: { flexDirection: "row", paddingHorizontal: 16, gap: 8, marginBottom: 6 },
  tab: { paddingVertical: 8, paddingHorizontal: 14, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabActive: { borderBottomColor: colors.primary },
  tabText: { color: colors.textTertiary, fontSize: 11, letterSpacing: 2, fontWeight: "700" },
  empty: { alignItems: "center", paddingVertical: 60 },
  emptyText: { color: colors.textPrimary, fontSize: 15, fontWeight: "600", marginTop: 14 },
  emptySub: { color: colors.textSecondary, fontSize: 12, marginTop: 8, textAlign: "center", paddingHorizontal: 30, lineHeight: 17 },
  row: { flexDirection: "row", backgroundColor: colors.card, borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 3, alignItems: "center" },
  topLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  email: { color: colors.textPrimary, fontSize: 14, fontFamily: mono, fontWeight: "600" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: colors.border, backgroundColor: "#0F0F0F" },
  badgeText: { color: colors.textSecondary, fontSize: 10, fontFamily: mono },
  ts: { color: colors.textTertiary, fontSize: 10, fontFamily: mono },
  reasonRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 8 },
  reasonChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, borderWidth: 1, borderColor: colors.highBorder, backgroundColor: colors.highBg },
  reasonChipText: { color: colors.high, fontSize: 10 },
  score: { fontSize: 32, fontFamily: mono, fontWeight: "700", marginLeft: 10 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modal: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: "90%", borderWidth: 1 },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  modalTitle: { color: colors.textTertiary, fontSize: 11, letterSpacing: 2, fontWeight: "700" },
  modalEmail: { color: colors.textPrimary, fontSize: 20, fontWeight: "700" },
  modalMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 4, fontFamily: mono },
  riskBox: { flexDirection: "row", borderRadius: 10, padding: 14, borderWidth: 1, marginTop: 14 },
  riskLabel: { color: colors.textTertiary, fontSize: 10, letterSpacing: 1, fontWeight: "700" },
  riskVal: { color: colors.high, fontSize: 30, fontFamily: mono, fontWeight: "700", marginTop: 4 },
  sectionLabel: { color: colors.textTertiary, fontSize: 10, letterSpacing: 2, marginTop: 16, marginBottom: 8, fontWeight: "700" },
  reasonLine: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  reasonText: { color: colors.textSecondary, fontSize: 12 },
  kvRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: colors.border },
  kvKey: { color: colors.textTertiary, fontSize: 12 },
  kvVal: { color: colors.textPrimary, fontSize: 12, fontFamily: mono },
  promptPreview: { color: colors.textPrimary, fontSize: 12, fontFamily: mono, lineHeight: 17, marginTop: 10, backgroundColor: "#0F0F0F", borderRadius: 8, borderWidth: 1, borderColor: colors.border, padding: 10 },
  noteInput: { backgroundColor: "#0F0F0F", borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, color: colors.textPrimary, fontSize: 13, minHeight: 60, textAlignVertical: "top" },
  err: { color: colors.high, fontSize: 12, marginTop: 10, fontFamily: mono },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  actBtn: { flex: 1, paddingVertical: 14, borderRadius: 8, alignItems: "center" },
  actText: { color: "#fff", fontSize: 14, fontWeight: "700", letterSpacing: 2 },
  decisionBox: { marginTop: 18, padding: 14, backgroundColor: "#0F0F0F", borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  decisionBy: { color: colors.textSecondary, fontSize: 11, marginTop: 8, fontFamily: mono },
  decisionNote: { color: colors.textSecondary, fontSize: 12, fontStyle: "italic", marginTop: 6 },
});
