import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
  Alert, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth, apiGet, apiPost } from "../../src/auth";
import { colors, mono, riskBg, riskBorder, riskColor } from "../../src/theme";

type UserTokenStats = {
  user_id: string;
  email: string;
  name: string;
  role: string;
  total_tokens: number;
  request_count: number;
  avg_risk: number;
  high_risk_count: number;
  blocked_count: number;
  last_activity: string;
  is_blocked: boolean;
  tokens_last_hour: number;
  req_last_hour: number;
  tokens_last_10min: number;
  req_last_10min: number;
  high_risk_last_10min: number;
  avg_tokens_per_request: number;
  estimated_cost: number;
  projected_hourly_tokens: number;
  projected_hourly_cost: number;
  pressure_score: number;
  recommendation: "ALLOW_AND_WATCH" | "RATE_LIMIT_AND_MONITOR" | "BLOCK_OR_REVIEW";
};

type TokenReport = {
  summary: {
    user_count: number;
    blocked_users: number;
    total_tokens: number;
    tokens_last_hour: number;
    estimated_total_cost: number;
    projected_hourly_cost: number;
    active_bursts: number;
    high_pressure_users: number;
  };
  users: UserTokenStats[];
};

export default function TokenMonitorScreen() {
  const { token } = useAuth();
  const [report, setReport] = useState<TokenReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const data = await apiGet("/api/ai/token-usage", token);
      setReport(data || { summary: null, users: [] });
    } catch (err: any) {
      console.error("Failed to fetch token stats:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const users = report?.users || [];
  const summary = report?.summary;

  const onRefresh = () => {
    setRefreshing(true);
    fetchStats();
  };

  const toggleBlock = async (user: UserTokenStats) => {
    const action = user.is_blocked ? "unblock" : "block";

    Alert.alert(
      `${action === "block" ? "Block" : "Unblock"} AI Access`,
      `Do you want to ${action} AI access for ${user.name || user.email}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: action === "block" ? "Block" : "Unblock",
          style: action === "block" ? "destructive" : "default",
          onPress: async () => {
            setActionLoading(user.user_id);
            try {
              await apiPost(`/api/ai/${action}-user/${user.user_id}`, {}, token);
              fetchStats();
            } catch (err: any) {
              Alert.alert("Error", err.message || `Failed to ${action} user`);
            } finally {
              setActionLoading(null);
            }
          },
        },
      ],
    );
  };

  const getPressureLevel = (score: number) => {
    if (score >= 70) return "CRITICAL";
    if (score >= 45) return "HIGH";
    if (score >= 20) return "MEDIUM";
    return "LOW";
  };

  const formatTokens = (tokens: number) => {
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
    return `${tokens}`;
  };

  const formatCurrency = (value: number) => `$${value.toFixed(value >= 10 ? 0 : 2)}`;

  const renderRecommendation = (recommendation: UserTokenStats["recommendation"]) => {
    if (recommendation === "BLOCK_OR_REVIEW") return "Block or force review";
    if (recommendation === "RATE_LIMIT_AND_MONITOR") return "Rate limit and monitor";
    return "Allow and watch";
  };

  const renderSignal = (item: UserTokenStats) => {
    if (item.is_blocked) return "Access contained";
    if (item.tokens_last_10min >= 6000 || item.req_last_10min >= 15) return "Burst detected";
    if (item.projected_hourly_cost >= 0.75) return "Cost spike";
    return "Stable";
  };

  const renderUser = ({ item }: { item: UserTokenStats }) => {
    const pressureLevel = getPressureLevel(item.pressure_score);
    const accent = riskColor(pressureLevel);
    const burstActive = item.tokens_last_10min >= 6000 || item.req_last_10min >= 15;

    return (
      <View style={[
        styles.card,
        { borderColor: riskBorder(pressureLevel), backgroundColor: item.is_blocked ? colors.criticalBg : colors.card },
      ]}>
        <View style={styles.cardHeader}>
          <View style={styles.userInfo}>
            <View style={[styles.avatar, item.is_blocked && styles.avatarBlocked]}>
              <Ionicons
                name={item.is_blocked ? "ban" : "person"}
                size={18}
                color={item.is_blocked ? colors.critical : colors.textPrimary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.nameRow}>
                <Text style={styles.userName}>{item.name || "Unknown"}</Text>
                <View style={[styles.levelBadge, { borderColor: riskBorder(pressureLevel), backgroundColor: riskBg(pressureLevel) }]}>
                  <Text style={[styles.levelBadgeText, { color: accent }]}>{pressureLevel}</Text>
                </View>
              </View>
              <Text style={styles.userEmail}>{item.email}</Text>
            </View>
          </View>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{item.role}</Text>
          </View>
        </View>

        <View style={styles.metricRow}>
          <MetricPill label="10m Burn" value={formatTokens(item.tokens_last_10min)} color={burstActive ? colors.high : colors.primary} />
          <MetricPill label="Hourly Cost" value={formatCurrency(item.projected_hourly_cost)} color={item.projected_hourly_cost >= 0.75 ? colors.high : colors.textPrimary} />
          <MetricPill label="Pressure" value={`${item.pressure_score}`} color={accent} />
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailText}>Total {formatTokens(item.total_tokens)} tokens</Text>
          <Text style={styles.detailText}>{item.req_last_10min} req / 10m</Text>
          <Text style={styles.detailText}>{formatTokens(item.avg_tokens_per_request)} tok / req</Text>
        </View>

        <View style={styles.statusRow}>
          <View style={[styles.statusBadge, { backgroundColor: riskBg(pressureLevel), borderColor: riskBorder(pressureLevel) }]}>
            <Ionicons
              name={item.is_blocked ? "shield" : burstActive ? "flash" : item.projected_hourly_cost >= 0.75 ? "cash" : "checkmark-circle"}
              size={12}
              color={accent}
            />
            <Text style={[styles.statusText, { color: accent }]}>{renderSignal(item)}</Text>
          </View>
          <Text style={styles.recommendationInline}>{renderRecommendation(item.recommendation)}</Text>
        </View>

        <View style={styles.actions}>
          <Text style={styles.lastActivity}>
            Last activity: {item.last_activity ? new Date(item.last_activity).toLocaleString() : "Never"}
          </Text>
          <TouchableOpacity
            style={[
              styles.actionBtn,
              item.is_blocked ? styles.unblockBtn : item.recommendation === "BLOCK_OR_REVIEW" ? styles.blockBtn : styles.monitorBtn,
            ]}
            onPress={() => toggleBlock(item)}
            disabled={actionLoading === item.user_id}
          >
            {actionLoading === item.user_id ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons
                  name={item.is_blocked ? "checkmark-circle" : item.recommendation === "BLOCK_OR_REVIEW" ? "ban" : "eye"}
                  size={14}
                  color="#fff"
                />
                <Text style={styles.actionText}>
                  {item.is_blocked ? "Restore AI" : item.recommendation === "BLOCK_OR_REVIEW" ? "Block AI" : "Contain"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <FlatList
        data={users}
        renderItem={renderUser}
        keyExtractor={(item) => item.user_id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListHeaderComponent={(
          <View>
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <View style={styles.iconBox}>
                  <Ionicons name="flash" size={20} color={colors.primary} />
                </View>
                <View>
                  <Text style={styles.headerTitle}>Token Risk Control</Text>
                  <Text style={styles.headerSub}>Watch usage spikes before they become cost or abuse incidents</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
                <Ionicons name="refresh" size={20} color={colors.primary} />
              </TouchableOpacity>
            </View>

            {summary && (
              <View style={styles.summaryBar}>
                <SummaryCard label="Hourly Cost" value={formatCurrency(summary.projected_hourly_cost)} tone={summary.projected_hourly_cost >= 2 ? colors.high : colors.primary} />
                <SummaryCard label="Last Hour" value={formatTokens(summary.tokens_last_hour)} tone={colors.textPrimary} />
                <SummaryCard label="Bursts" value={`${summary.active_bursts}`} tone={summary.active_bursts > 0 ? colors.high : colors.low} />
                <SummaryCard label="Blocked" value={`${summary.blocked_users}`} tone={summary.blocked_users > 0 ? colors.critical : colors.textPrimary} />
              </View>
            )}

            <View style={styles.infoLine}>
              <Ionicons name="information-circle-outline" size={14} color={colors.textTertiary} />
              <Text style={styles.infoText}>High token bursts can signal automation abuse, token bombing, or runaway AI cost.</Text>
            </View>

            <Text style={styles.sectionTitle}>USERS</Text>
          </View>
        )}
        ListEmptyComponent={(
          <View style={styles.empty}>
            <Ionicons name="flash-outline" size={48} color={colors.textTertiary} />
            <Text style={styles.emptyText}>No AI usage data yet</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, { color: tone }]}>{value}</Text>
    </View>
  );
}

function MetricPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.metricPill}>
      <Text style={styles.metricPillLabel}>{label}</Text>
      <Text style={[styles.metricPillValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 16, paddingTop: 8, paddingBottom: 32 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: "700" },
  headerSub: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },
  refreshBtn: { padding: 8 },
  summaryBar: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  summaryLabel: { color: colors.textTertiary, fontSize: 10, letterSpacing: 1, fontWeight: "700" },
  summaryValue: { fontSize: 20, fontWeight: "700", fontFamily: mono, marginTop: 8 },
  infoLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  infoText: { color: colors.textSecondary, fontSize: 11, flex: 1, lineHeight: 16 },
  sectionTitle: { color: colors.textTertiary, fontSize: 10, letterSpacing: 2, fontWeight: "700", marginBottom: 10 },
  card: {
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  userInfo: { flexDirection: "row", gap: 10, alignItems: "center", flex: 1 },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarBlocked: { backgroundColor: colors.criticalBg },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  userName: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
  userEmail: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },
  roleBadge: {
    backgroundColor: colors.bg,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  roleText: { color: colors.textSecondary, fontSize: 10, fontWeight: "700" },
  levelBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  levelBadgeText: { fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  metricRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  metricPill: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metricPillLabel: { color: colors.textTertiary, fontSize: 9, letterSpacing: 1, fontWeight: "700" },
  metricPillValue: { fontSize: 16, fontWeight: "700", fontFamily: mono, marginTop: 6 },
  detailRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 10,
  },
  detailText: { color: colors.textSecondary, fontSize: 11 },
  statusRow: {
    flexDirection: "row",
    marginTop: 10,
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusText: { fontSize: 11, fontWeight: "700" },
  recommendationInline: { color: colors.textSecondary, fontSize: 11, fontWeight: "600" },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  lastActivity: { color: colors.textTertiary, fontSize: 10, flex: 1 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  blockBtn: { backgroundColor: colors.critical },
  unblockBtn: { backgroundColor: colors.low },
  monitorBtn: { backgroundColor: colors.high },
  actionText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  empty: { alignItems: "center", paddingTop: 80 },
  emptyText: { color: colors.textTertiary, fontSize: 14, marginTop: 12 },
});
