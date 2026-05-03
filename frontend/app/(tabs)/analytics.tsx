import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Dimensions, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LineChart, BarChart } from "react-native-chart-kit";
import { useAuth, apiGet } from "../../src/auth";
import { colors, mono } from "../../src/theme";
import { Redirect } from "expo-router";

const screenW = Dimensions.get("window").width;

export default function Analytics() {
  const { token, user } = useAuth();
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setData(await apiGet("/api/analytics", token)); }
    catch (e) { console.warn(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  if (user?.role === "security_team") return <Redirect href="/dashboard" />;

  if (loading || !data) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;

  const trend = data.risk_trend || [];
  const trendLabels = trend.map((_: any, i: number) => (i % 5 === 0 ? String(i + 1) : ""));
  const trendData = trend.map((p: any) => p.risk);
  const hourData = (data.login_hour_distribution || []).slice();
  const width = Math.max(screenW - 32, 300);

  const chartConfig = {
    backgroundGradientFrom: colors.card,
    backgroundGradientTo: colors.card,
    color: (o = 1) => `rgba(59,130,246,${o})`,
    labelColor: () => colors.textSecondary,
    strokeWidth: 2,
    decimalPlaces: 0,
    propsForBackgroundLines: { stroke: colors.border },
    propsForLabels: { fontFamily: mono, fontSize: 10 },
  };

  return (
    <SafeAreaView style={styles.c} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>ANALYTICS</Text>
        <Text style={styles.sub}>Behavioral intelligence · {data.total_events} events</Text>
      </View>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        <View style={styles.pill}>
          <Stat label="LOW" value={data.level_distribution.LOW} color={colors.low} />
          <Stat label="MEDIUM" value={data.level_distribution.MEDIUM} color={colors.medium} />
          <Stat label="HIGH" value={data.level_distribution.HIGH} color={colors.high} />
        </View>

        <Text style={styles.chartTitle}>RISK SCORE TREND</Text>
        {trendData.length > 1 ? (
          <LineChart
            data={{ labels: trendLabels, datasets: [{ data: trendData }] }}
            width={width} height={200} chartConfig={chartConfig}
            bezier style={styles.chart} withDots={trendData.length < 20} fromZero
          />
        ) : <EmptyChart />}

        <Text style={styles.chartTitle}>LOGIN HOUR DISTRIBUTION</Text>
        <BarChart
          data={{ labels: ["0", "4", "8", "12", "16", "20"], datasets: [{ data: [hourData[0] || 0, hourData[4] || 0, hourData[8] || 0, hourData[12] || 0, hourData[16] || 0, hourData[20] || 0] }] }}
          width={width} height={200} chartConfig={chartConfig} style={styles.chart}
          yAxisLabel="" yAxisSuffix="" fromZero showValuesOnTopOfBars
        />

        <Text style={styles.chartTitle}>DEVICE DISTRIBUTION</Text>
        <View style={styles.deviceRow}>
          {Object.entries(data.device_distribution).map(([k, v]: any) => (
            <View key={k} style={styles.deviceCard}>
              <Text style={styles.deviceKey}>{k.toUpperCase()}</Text>
              <Text style={styles.deviceVal}>{v}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const Stat = ({ label, value, color }: any) => (
  <View style={styles.stat}>
    <Text style={[styles.statVal, { color }]}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const EmptyChart = () => (
  <View style={styles.emptyChart}>
    <Text style={styles.emptyText}>Not enough data. Trigger Simulate events to see the trend.</Text>
  </View>
);

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  header: { paddingHorizontal: 16, paddingBottom: 12 },
  title: { color: colors.textPrimary, fontSize: 22, fontWeight: "700", letterSpacing: 1 },
  sub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  pill: { flexDirection: "row", backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 20, justifyContent: "space-around" },
  stat: { alignItems: "center" },
  statVal: { fontSize: 28, fontFamily: mono, fontWeight: "700" },
  statLabel: { color: colors.textTertiary, fontSize: 10, letterSpacing: 1, marginTop: 4, fontWeight: "700" },
  chartTitle: { color: colors.textTertiary, fontSize: 10, letterSpacing: 2, fontWeight: "700", marginTop: 8, marginBottom: 10 },
  chart: { borderRadius: 12, marginBottom: 10 },
  emptyChart: { backgroundColor: colors.card, borderRadius: 12, padding: 30, borderWidth: 1, borderColor: colors.border, alignItems: "center", marginBottom: 16 },
  emptyText: { color: colors.textSecondary, fontSize: 12, textAlign: "center" },
  deviceRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  deviceCard: { flex: 1, backgroundColor: colors.card, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  deviceKey: { color: colors.textTertiary, fontSize: 10, letterSpacing: 1, fontWeight: "700" },
  deviceVal: { color: colors.primary, fontSize: 24, fontFamily: mono, fontWeight: "700", marginTop: 6 },
});
