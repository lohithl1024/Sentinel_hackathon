import { useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ActivityIndicator, ScrollView, TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { apiGetPublic, useAuth } from "../src/auth";
import { colors, mono } from "../src/theme";

export default function Awaiting() {
  const router = useRouter();
  const { setAuth } = useAuth();
  const params = useLocalSearchParams<{ requestId: string; risk: string; role: string; reasons: string }>();
  const reasons: string[] = params.reasons ? JSON.parse(params.reasons as string) : [];
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">("pending");
  const [err, setErr] = useState<string | null>(null);
  const [reviewedBy, setReviewedBy] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState<string | null>(null);
  const pollRef = useRef<any>(null);
  const pollCountRef = useRef(0);

  useEffect(() => {
    const poll = async () => {
      try {
        pollCountRef.current += 1;
        const r = await apiGetPublic(`/api/approvals/status/${params.requestId}`);
        if (r.status === "approved" && r.token && r.user) {
          setStatus("approved");
          setReviewedBy(r.reviewed_by?.email || null);
          setReviewNote(r.review_note || null);
          await AsyncStorage.setItem("ueba_token", r.token);
          await setAuth(r.token, r.user);
          clearInterval(pollRef.current);
          setTimeout(() => router.replace("/(tabs)/dashboard"), 1400);
        } else if (r.status === "rejected") {
          setStatus("rejected");
          setReviewedBy(r.reviewed_by?.email || null);
          setReviewNote(r.review_note || null);
          clearInterval(pollRef.current);
        }
      } catch (e: any) { setErr(e.message); }
    };
    poll();
    pollRef.current = setInterval(poll, 3000);
    return () => clearInterval(pollRef.current);
  }, [params.requestId]);

  return (
    <SafeAreaView style={styles.c}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        {status === "pending" && (
          <View style={styles.hero}>
            <View style={styles.iconBox}>
              <ActivityIndicator size="large" color={colors.high} />
            </View>
            <Text style={styles.title}>Awaiting Security Approval</Text>
            <Text style={styles.sub}>High-risk behavior detected. Your login is being reviewed by the security team.</Text>
            <View style={styles.dots}><Text style={styles.pollText}>Polling… check #{pollCountRef.current}</Text></View>
          </View>
        )}
        {status === "approved" && (
          <View style={styles.hero}>
            <Ionicons name="checkmark-circle" size={64} color={colors.low} />
            <Text style={styles.title}>Access Approved</Text>
            <Text style={styles.sub}>Redirecting to your dashboard…</Text>
            {reviewedBy && <Text style={styles.reviewLine}>Reviewed by {reviewedBy}</Text>}
          </View>
        )}
        {status === "rejected" && (
          <View style={styles.hero}>
            <Ionicons name="close-circle" size={64} color={colors.high} />
            <Text style={styles.title}>Access Denied</Text>
            <Text style={styles.sub}>The security team rejected this login attempt.</Text>
            {reviewedBy && <Text style={styles.reviewLine}>Reviewed by {reviewedBy}</Text>}
            {reviewNote && <Text style={styles.reviewNote}>"{reviewNote}"</Text>}
            <TouchableOpacity testID="awaiting-back" style={styles.btn} onPress={() => router.replace("/login")}>
              <Text style={styles.btnText}>BACK TO LOGIN</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.detail}>
          <Text style={styles.detailLabel}>REQUEST DETAILS</Text>
          <Row k="Risk Score" v={params.risk || "?"} valueColor={colors.high} />
          <Row k="Role" v={String(params.role || "—")} />
          <Row k="Request ID" v={String(params.requestId).slice(0, 12) + "…"} />
          <Text style={styles.sectionLabel}>FLAGGED REASONS</Text>
          {reasons.map((r, i) => (
            <View key={i} style={styles.reasonRow}>
              <Ionicons name="alert-circle" size={14} color={colors.high} />
              <Text style={styles.reasonText}>{r}</Text>
            </View>
          ))}
        </View>

        <View style={styles.hintBox}>
          <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
          <Text style={styles.hintText}>
            To approve: sign in as <Text style={styles.hintMono}>security@gmail.com</Text> and use the Approvals tab.
          </Text>
        </View>

        {err && <Text style={styles.err}>{err}</Text>}
        <TouchableOpacity testID="awaiting-cancel" onPress={() => router.replace("/login")} style={{ marginTop: 20 }}>
          <Text style={styles.cancel}>Cancel request</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const Row = ({ k, v, valueColor }: any) => (
  <View style={styles.kvRow}>
    <Text style={styles.kvKey}>{k}</Text>
    <Text style={[styles.kvVal, valueColor && { color: valueColor }]}>{v}</Text>
  </View>
);

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.bg },
  hero: { alignItems: "center", paddingVertical: 30 },
  iconBox: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.highBg, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.highBorder },
  title: { color: colors.textPrimary, fontSize: 22, fontWeight: "700", marginTop: 18, textAlign: "center" },
  sub: { color: colors.textSecondary, fontSize: 13, marginTop: 8, textAlign: "center", paddingHorizontal: 20, lineHeight: 18 },
  dots: { marginTop: 12 },
  pollText: { color: colors.textTertiary, fontSize: 11, fontFamily: mono },
  reviewLine: { color: colors.textSecondary, fontSize: 12, marginTop: 10, fontFamily: mono },
  reviewNote: { color: colors.textSecondary, fontSize: 12, fontStyle: "italic", marginTop: 4 },
  detail: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16, marginTop: 20 },
  detailLabel: { color: colors.textTertiary, fontSize: 10, letterSpacing: 2, fontWeight: "700", marginBottom: 10 },
  kvRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  kvKey: { color: colors.textSecondary, fontSize: 12 },
  kvVal: { color: colors.textPrimary, fontSize: 13, fontFamily: mono, fontWeight: "600" },
  sectionLabel: { color: colors.textTertiary, fontSize: 10, letterSpacing: 2, marginTop: 14, marginBottom: 8, fontWeight: "700" },
  reasonRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  reasonText: { color: colors.textSecondary, fontSize: 12 },
  hintBox: { flexDirection: "row", gap: 10, alignItems: "center", backgroundColor: "rgba(59,130,246,0.08)", borderColor: "rgba(59,130,246,0.3)", borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 14 },
  hintText: { color: colors.textSecondary, fontSize: 12, flex: 1, lineHeight: 17 },
  hintMono: { color: colors.primary, fontFamily: mono },
  err: { color: colors.high, fontSize: 12, marginTop: 14, fontFamily: mono },
  btn: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 20, marginTop: 20 },
  btnText: { color: "#fff", fontWeight: "700", letterSpacing: 2 },
  cancel: { color: colors.textSecondary, textAlign: "center", fontSize: 13 },
});
