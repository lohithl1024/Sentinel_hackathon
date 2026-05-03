// this is team z
import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../src/auth";
import { colors, mono } from "../src/theme";

const ROLES = [
  { key: "employee", label: "Employee" },
  { key: "team_lead", label: "Team Lead" },
  { key: "ceo", label: "CEO" },
  { key: "security_team", label: "Security Team" },
];
const SHIFTS = [
  { key: "day", label: "Day (09–18)" },
  { key: "night", label: "Night (22–06)" },
];

export default function Register() {
  const router = useRouter();
  const { register } = useAuth();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [role, setRole] = useState("employee");
  const [shift, setShift] = useState("day");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async () => {
    setErr(null); setLoading(true);
    try {
      await register(email.trim().toLowerCase(), pw, name || undefined, role, shift);
      router.replace("/(tabs)/dashboard");
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.c}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
          <TouchableOpacity testID="back-to-login" onPress={() => router.back()} style={styles.back}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.h1}>Create account</Text>
          <Text style={styles.sub}>Your role-based baseline will be used for behavioral analysis.</Text>

          <Text style={styles.label}>NAME</Text>
          <TextInput testID="reg-name" value={name} onChangeText={setName} placeholder="Jane Smith"
            placeholderTextColor={colors.textTertiary} style={styles.input} />

          <Text style={styles.label}>EMAIL</Text>
          <TextInput testID="reg-email" value={email} onChangeText={setEmail} autoCapitalize="none"
            keyboardType="email-address" placeholder="you@company.io"
            placeholderTextColor={colors.textTertiary} style={styles.input} />

          <Text style={styles.label}>PASSWORD</Text>
          <TextInput testID="reg-password" value={pw} onChangeText={setPw} secureTextEntry
            placeholder="At least 6 characters" placeholderTextColor={colors.textTertiary} style={styles.input} />

          <Text style={styles.label}>ROLE</Text>
          <View style={styles.chipRow}>
            {ROLES.map((r) => (
              <TouchableOpacity key={r.key} testID={`role-${r.key}`}
                style={[styles.chip, role === r.key && styles.chipActive]}
                onPress={() => setRole(r.key)}>
                <Text style={[styles.chipText, role === r.key && { color: colors.primary }]}>{r.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>SHIFT</Text>
          <View style={styles.chipRow}>
            {SHIFTS.map((s) => (
              <TouchableOpacity key={s.key} testID={`shift-${s.key}`}
                style={[styles.chip, shift === s.key && styles.chipActive]}
                onPress={() => setShift(s.key)}>
                <Text style={[styles.chipText, shift === s.key && { color: colors.primary }]}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {err && <Text testID="reg-error" style={styles.err}>{err}</Text>}
          <TouchableOpacity testID="reg-submit" style={styles.btn} onPress={onSubmit} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>CREATE ACCOUNT</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.bg },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  h1: { color: colors.textPrimary, fontSize: 28, fontWeight: "700" },
  sub: { color: colors.textSecondary, fontSize: 13, marginTop: 6, marginBottom: 24 },
  label: { color: colors.textTertiary, fontSize: 11, letterSpacing: 1, fontWeight: "600", marginTop: 14, marginBottom: 6 },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, color: colors.textPrimary, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
  chipActive: { borderColor: colors.primary, backgroundColor: "rgba(59,130,246,0.1)" },
  chipText: { color: colors.textSecondary, fontSize: 12, fontFamily: mono },
  err: { color: colors.high, fontSize: 12, marginTop: 14, fontFamily: mono },
  btn: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 14, alignItems: "center", marginTop: 26 },
  btnText: { color: "#fff", fontSize: 14, fontWeight: "700", letterSpacing: 2 },
});
