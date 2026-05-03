// this is team z
export const colors = {
  bg: "#0A0A0A",
  card: "#1A1A1A",
  cardHover: "#222222",
  border: "#2A2A2A",
  borderFocus: "#3B82F6",
  textPrimary: "#F3F4F6",
  textSecondary: "#9CA3AF",
  textTertiary: "#6B7280",
  primary: "#3B82F6",
  primaryHover: "#2563EB",
  accent: "#8B5CF6",
  // 4-tier risk colors
  low: "#10B981",
  lowBg: "rgba(16,185,129,0.1)",
  lowBorder: "rgba(16,185,129,0.3)",
  medium: "#F59E0B",
  mediumBg: "rgba(245,158,11,0.1)",
  mediumBorder: "rgba(245,158,11,0.3)",
  high: "#F97316",
  highBg: "rgba(249,115,22,0.1)",
  highBorder: "rgba(249,115,22,0.5)",
  critical: "#EF4444",
  criticalBg: "rgba(239,68,68,0.15)",
  criticalBorder: "rgba(239,68,68,0.6)",
  danger: "#EF4444",
};

export const mono = "Menlo, Courier New, monospace";

export const riskColor = (level: string) => {
  if (level === "CRITICAL") return colors.critical;
  if (level === "HIGH") return colors.high;
  if (level === "MEDIUM") return colors.medium;
  return colors.low;
};

export const riskBg = (level: string) => {
  if (level === "CRITICAL") return colors.criticalBg;
  if (level === "HIGH") return colors.highBg;
  if (level === "MEDIUM") return colors.mediumBg;
  return colors.lowBg;
};

export const riskBorder = (level: string) => {
  if (level === "CRITICAL") return colors.criticalBorder;
  if (level === "HIGH") return colors.highBorder;
  if (level === "MEDIUM") return colors.mediumBorder;
  return colors.lowBorder;
};
