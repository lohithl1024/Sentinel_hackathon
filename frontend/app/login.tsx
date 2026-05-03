// this is team z
import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator, ImageBackground,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../src/auth";
import { colors, mono } from "../src/theme";

const BG_IMG = "https://images.pexels.com/photos/14314638/pexels-photo-14314638.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940";

const DEMO = [
  { name: "Vaibhav Rao", email: "security@gmail.com", pw: "Security@123", role: "Security Team" },
  { name: "Layana Joseph", email: "punith@gmail.com", pw: "Punith@123", role: "Employee" },
  { name: "Ramesh Iyer", email: "sudeep@gmail.com", pw: "Sudeep@123", role: "CEO" },
];

export default function Login() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("security@gmail.com");
  const [pw, setPw] = useState("Security@123");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async () => {
    setErr(null);
    setLoading(true);
    try {
      const r = await login(email.trim().toLowerCase(), pw);
      if (r.action === "REQUIRE_OTP") {
        router.replace({
          pathname: "/otp",
          params: { eventId: r.event_id, otp: r.otp_challenge?.demo_otp, risk: String(r.risk_score), reasons: JSON.stringify(r.explanation) },
        });
      } else if (r.action === "REQUIRE_APPROVAL") {
        router.replace({
          pathname: "/awaiting",
          params: {
            requestId: r.approval_request?.request_id,
            risk: String(r.risk_score),
            role: r.role || "",
            reasons: JSON.stringify(r.explanation),
          },
        });
      } else {
        router.replace("/(tabs)/dashboard");
      }
    } catch (e: any) {
      setErr(e.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ImageBackground source={{ uri: BG_IMG }} style={styles.bg} blurRadius={8}>
      <View style={styles.overlay} />
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={styles.brand}>
              <View style={styles.logoBox}>
                <Ionicons name="shield-checkmark" size={30} color={colors.primary} />
              </View>
              <Text style={styles.brandTitle}>SENTINEL</Text>
              <Text style={styles.brandSub}>AI Security & Behavior Monitoring</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.h2}>Sign in</Text>
              <Text style={styles.sub}>Behavioral ML monitors every session.</Text>

              <Text style={styles.label}>EMAIL</Text>
              <TextInput
                testID="login-email-input"
                value={email} onChangeText={setEmail}
                autoCapitalize="none" keyboardType="email-address"
                placeholder="you@company.io" placeholderTextColor={colors.textTertiary}
                style={styles.input}
              />
              <Text style={styles.label}>PASSWORD</Text>
              <TextInput
                testID="login-password-input"
                value={pw} onChangeText={setPw} secureTextEntry
                placeholder="••••••••" placeholderTextColor={colors.textTertiary}
                style={styles.input}
              />

              {err && <Text testID="login-error" style={styles.err}>{err}</Text>}

              <TouchableOpacity testID="login-submit-button" style={styles.btn} onPress={onSubmit} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>AUTHENTICATE</Text>}
              </TouchableOpacity>

              <TouchableOpacity testID="go-to-register" onPress={() => router.push("/register")} style={{ marginTop: 14 }}>
                <Text style={styles.linkMuted}>No account? <Text style={styles.link}>Register</Text></Text>
              </TouchableOpacity>
            </View>

            <View style={styles.demoCard}>
              <Text style={styles.demoTitle}>DEMO ACCOUNTS</Text>
              {DEMO.map((d) => (
                <TouchableOpacity
                  key={d.email}
                  testID={`demo-fill-${d.email.split("@")[0]}`}
                  style={styles.demoRow}
                  onPress={() => { setEmail(d.email); setPw(d.pw); }}
                >
                  <Ionicons name="person-circle-outline" size={18} color={colors.textSecondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.demoName}>{d.name}</Text>
                    <Text style={styles.demoEmail}>{d.email}</Text>
                    <Text style={styles.demoRole}>{d.role}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.bg },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(10,10,10,0.85)" },
  scroll: { padding: 20, paddingBottom: 40 },
  brand: { alignItems: "center", marginTop: 30, marginBottom: 28 },
  logoBox: { width: 56, height: 56, borderRadius: 14, backgroundColor: colors.card, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
  brandTitle: { color: colors.textPrimary, fontSize: 22, fontWeight: "700", letterSpacing: 6 },
  brandSub: { color: colors.textSecondary, fontSize: 12, marginTop: 4, letterSpacing: 1 },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 22, borderWidth: 1, borderColor: colors.border },
  h2: { color: colors.textPrimary, fontSize: 22, fontWeight: "700" },
  sub: { color: colors.textSecondary, fontSize: 13, marginTop: 4, marginBottom: 18 },
  label: { color: colors.textTertiary, fontSize: 11, fontWeight: "600", letterSpacing: 1, marginBottom: 6, marginTop: 10 },
  input: { backgroundColor: "#0F0F0F", borderWidth: 1, borderColor: colors.border, color: colors.textPrimary, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  err: { color: colors.high, fontSize: 12, marginTop: 12, fontFamily: mono },
  btn: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 14, alignItems: "center", marginTop: 20 },
  btnText: { color: "#fff", fontSize: 14, fontWeight: "700", letterSpacing: 2 },
  link: { color: colors.primary, fontWeight: "600" },
  linkMuted: { color: colors.textSecondary, textAlign: "center", fontSize: 13 },
  demoCard: { marginTop: 20, backgroundColor: colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border },
  demoTitle: { color: colors.textTertiary, fontSize: 10, letterSpacing: 2, fontWeight: "700", marginBottom: 8 },
  demoRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, gap: 8 },
  demoName: { color: colors.textPrimary, fontSize: 13, fontWeight: "700" },
  demoEmail: { color: colors.textPrimary, fontSize: 13, fontFamily: mono },
  demoRole: { color: colors.textTertiary, fontSize: 10, marginTop: 2 },
  demoPw: { color: colors.textSecondary, fontSize: 12, fontFamily: mono },
});
