// this is team z
import { Tabs, Redirect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/auth";
import { colors } from "../../src/theme";
import { View, ActivityIndicator } from "react-native";

export default function TabsLayout() {
  const { user } = useAuth();
  if (user === undefined) {
    return <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color={colors.primary} />
    </View>;
  }
  if (!user) return <Redirect href="/login" />;

  const isSec = user.role === "security_team";
  const isCeo = user.role === "ceo";
  const isOfficer = isSec || isCeo; // Officers can see AI audit data

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.bg, borderTopColor: colors.card, borderTopWidth: 1,
          height: 66, paddingTop: 6, paddingBottom: 8,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarLabelStyle: { fontSize: 10, letterSpacing: 1, fontWeight: "600" },
      }}
    >
      {/* Chat - for employees/customers only, NOT security */}
      <Tabs.Screen name="chat" options={{
        title: "CHAT",
        href: isSec ? null : "/chat",
        tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles-outline" size={size} color={color} />,
      }} />

      {/* Dashboard - visible to all */}
      <Tabs.Screen name="dashboard" options={{
        title: "DASHBOARD",
        tabBarIcon: ({ color, size }) => <Ionicons name="shield-checkmark-outline" size={size} color={color} />,
      }} />

      {/* Logs - visible to all (own logs for users, all logs for officers) */}
      <Tabs.Screen name="logs" options={{
        title: "LOGS",
        tabBarIcon: ({ color, size }) => <Ionicons name="list-outline" size={size} color={color} />,
      }} />

      {/* Alerts - officer only */}
      <Tabs.Screen name="alerts" options={{
        title: "ALERTS",
        href: isOfficer ? "/alerts" : null,
        tabBarIcon: ({ color, size }) => <Ionicons name="alert-circle-outline" size={size} color={color} />,
      }} />

      {/* Approvals - security_team only */}
      <Tabs.Screen name="approvals" options={{
        title: "APPROVALS",
        href: isSec ? "/approvals" : null,
        tabBarIcon: ({ color, size }) => <Ionicons name="checkmark-done-outline" size={size} color={color} />,
      }} />

      {/* Monitor - security_team only */}
      <Tabs.Screen name="monitor" options={{
        title: "MONITOR",
        href: isSec ? "/monitor" : null,
        tabBarIcon: ({ color, size }) => <Ionicons name="eye-outline" size={size} color={color} />,
      }} />

      {/* Token Monitor - security_team only */}
      <Tabs.Screen name="tokens" options={{
        title: "TOKENS",
        href: isSec ? "/tokens" : null,
        tabBarIcon: ({ color, size }) => <Ionicons name="analytics-outline" size={size} color={color} />,
      }} />

      {/* Analytics - hidden for security team to keep the operator flow focused */}
      <Tabs.Screen name="analytics" options={{
        title: "ANALYTICS",
        href: isSec ? null : "/analytics",
        tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart-outline" size={size} color={color} />,
      }} />

      {/* Simulate - visible to all (for testing the security system) */}
      <Tabs.Screen name="simulate" options={{
        title: "SIMULATE",
        tabBarIcon: ({ color, size }) => <Ionicons name="flask-outline" size={size} color={color} />,
      }} />
    </Tabs>
  );
}
