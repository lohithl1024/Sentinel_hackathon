// this is team z
import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../src/auth";
import { colors, mono } from "../src/theme";

export default function OTP() {
  const router = useRouter();
  const { verifyOtp } = useAuth();
  const params = useLocalSearchParams<{ eventId: string; otp: string; risk: string; reasons: string }>();
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const reasons: string[] = params.reasons ? JSON.parse(params.reasons as string) : [];
  const risk = Number(params.risk || 0);

  const onVerify = async () => {
    setErr(null); setLoading(true);
    try {
      await verifyOtp(String(params.eventId), code.trim());
      router.replace("/(tabs)/dashboard");
    } catch (e: any) {
      setErr(e.message);
    } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.c}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
          <View style={styles.banner}>
            <Ionicons name="warning" size={24} color={colors.medium} />
            <Text style={styles.bannerTitle}>Additional verification required</Text>
            <Text style={styles.bannerSub}>Risk score {risk} · MEDIUM</Text>
          </View>

          <Text style={styles.h1}>Enter OTP</Text>
          <Text style={styles.sub}>We detected behavior that deviates from your baseline. For demo, the OTP is shown below.</Text>

          <View style={styles.demoOtp}>
            <Text style={styles.demoOtpLabel}>DEMO OTP</Text>
            <Text testID="demo-otp-display" style={styles.demoOtpValue}>{params.otp}</Text>
          </View>

          <Text style={styles.label}>VERIFICATION CODE</Text>
          <TextInput
            testID="otp-input"
            value={code} onChangeText={setCode}
            keyboardType="number-pad" maxLength={6}
            placeholder="------" placeholderTextColor={colors.textTertiary}
            style={styles.input}
          />

          <View style={styles.reasons}>
            <Text style={styles.reasonTitle}>WHY THIS CHALLENGE</Text>
            {reasons.map((r, i) => (
              <View key={i} style={styles.reasonRow}>
                <Ionicons name="alert-circle" size={14} color={colors.medium} />
                <Text style={styles.reasonText}>{r}</Text>
              </View>
            ))}
          </View>

          {err && <Text testID="otp-error" style={styles.err}>{err}</Text>}
          <TouchableOpacity testID="otp-verify-button" style={styles.btn} onPress={onVerify} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>VERIFY & CONTINUE</Text>}
          </TouchableOpacity>
          <TouchableOpacity testID="otp-cancel" onPress={() => router.replace("/login")} style={{ marginTop: 14 }}>
            <Text style={styles.cancel}>Cancel</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.bg },
  banner: { backgroundColor: colors.mediumBg, borderWidth: 1, borderColor: colors.mediumBorder, borderRadius: 12, padding: 16, marginBottom: 24 },
  bannerTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "700", marginTop: 6 },
  bannerSub: { color: colors.medium, fontSize: 12, marginTop: 2, fontFamily: mono },
  h1: { color: colors.textPrimary, fontSize: 28, fontWeight: "700" },
  sub: { color: colors.textSecondary, fontSize: 13, marginTop: 6, marginBottom: 20 },
  demoOtp: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 16, alignItems: "center", marginBottom: 18 },
  demoOtpLabel: { color: colors.textTertiary, fontSize: 10, letterSpacing: 2 },
  demoOtpValue: { color: colors.primary, fontSize: 32, fontFamily: mono, letterSpacing: 6, marginTop: 6, fontWeight: "700" },
  label: { color: colors.textTertiary, fontSize: 11, letterSpacing: 1, fontWeight: "600", marginBottom: 6 },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, color: colors.textPrimary, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 14, fontSize: 20, fontFamily: mono, letterSpacing: 6, textAlign: "center" },
  reasons: { marginTop: 20, backgroundColor: colors.card, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: colors.border },
  reasonTitle: { color: colors.textTertiary, fontSize: 10, letterSpacing: 2, fontWeight: "700", marginBottom: 10 },
  reasonRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  reasonText: { color: colors.textSecondary, fontSize: 12 },
  err: { color: colors.high, fontSize: 12, marginTop: 14, fontFamily: mono },
  btn: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 14, alignItems: "center", marginTop: 22 },
  btnText: { color: "#fff", fontSize: 14, fontWeight: "700", letterSpacing: 2 },
  cancel: { color: colors.textSecondary, textAlign: "center", fontSize: 13 },
});
