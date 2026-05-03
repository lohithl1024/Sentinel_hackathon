// this is team z
import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList,
  KeyboardAvoidingView, Platform, ActivityIndicator, Keyboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth, apiPost } from "../../src/auth";
import { colors, mono, riskColor, riskBg, riskBorder } from "../../src/theme";

type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  riskLevel?: string;
  riskScore?: number;
  action?: string;
  blocked?: boolean;
  awaitingApproval?: boolean;
  approvalRequestId?: string;
  piiMasked?: number;
};

export default function ChatScreen() {
  const { user, token } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    Keyboard.dismiss();

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await apiPost("/api/ai/chat", {
        message: trimmed,
        conversation_id: conversationId,
      }, token);

      if (!conversationId && res.conversation_id) {
        setConversationId(res.conversation_id);
      }

      const assistantMsg: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: res.response || "",
        timestamp: new Date().toISOString(),
        riskLevel: res.risk_level,
        riskScore: res.risk_score,
        action: res.action,
        blocked: res.blocked,
        awaitingApproval: res.awaiting_approval,
        approvalRequestId: res.approval_request_id,
        piiMasked: res.pii_masked_count,
      };

      // If blocked, show a system message
      if (res.blocked) {
        assistantMsg.role = "system";
        if (res.awaiting_approval) {
          assistantMsg.content = `🛡️ Your request has been flagged for security review.\n\nRisk Level: ${res.risk_level} (Score: ${res.risk_score})\n\nReasons:\n${res.explanation?.map((r: string) => `• ${r}`).join("\n") || "Security policy"}\n\nA security officer will review your request. You'll be notified when it's processed.`;
        } else {
          assistantMsg.content = `🚫 Request Blocked\n\nRisk Level: ${res.risk_level} (Score: ${res.risk_score})\n\nReasons:\n${res.explanation?.map((r: string) => `• ${r}`).join("\n") || "Security policy violation"}`;
        }
      }

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: Message = {
        id: `error-${Date.now()}`,
        role: "system",
        content: `Error: ${err.message || "Failed to send message"}`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, conversationId, token]);

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === "user";
    const isSystem = item.role === "system";

    return (
      <View style={[
        styles.messageBubble,
        isUser ? styles.userBubble : isSystem ? styles.systemBubble : styles.assistantBubble,
        item.blocked && { borderColor: riskBorder(item.riskLevel || "HIGH"), borderWidth: 1 },
      ]}>
        {!isUser && !isSystem && (
          <View style={styles.assistantHeader}>
            <Ionicons name="shield-checkmark" size={14} color={colors.primary} />
            <Text style={styles.assistantName}>Sentinel AI</Text>
            {item.riskLevel && (
              <View style={[styles.riskBadge, { backgroundColor: riskBg(item.riskLevel) }]}>
                <Text style={[styles.riskBadgeText, { color: riskColor(item.riskLevel) }]}>
                  {item.riskLevel}
                </Text>
              </View>
            )}
            {item.piiMasked && item.piiMasked > 0 && (
              <View style={styles.piiIndicator}>
                <Ionicons name="eye-off" size={10} color={colors.medium} />
                <Text style={styles.piiText}>{item.piiMasked} masked</Text>
              </View>
            )}
          </View>
        )}
        {isSystem && item.blocked && (
          <View style={styles.systemHeader}>
            <Ionicons 
              name={item.awaitingApproval ? "hourglass" : "alert-circle"} 
              size={16} 
              color={riskColor(item.riskLevel || "HIGH")} 
            />
            <Text style={[styles.systemTitle, { color: riskColor(item.riskLevel || "HIGH") }]}>
              {item.awaitingApproval ? "Pending Review" : "Blocked"}
            </Text>
          </View>
        )}
        <Text style={[
          styles.messageText,
          isUser && styles.userText,
          isSystem && styles.systemText,
        ]}>
          {item.content}
        </Text>
        <Text style={styles.timestamp}>
          {new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          {item.riskScore !== undefined && !isUser && ` • Risk: ${item.riskScore}`}
        </Text>
      </View>
    );
  };

  const startNewChat = () => {
    setMessages([]);
    setConversationId(null);
    setInput("");
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.logoBox}>
            <Ionicons name="chatbubbles" size={20} color={colors.primary} />
          </View>
          <View>
            <Text style={styles.headerTitle}>Sentinel AI</Text>
            <Text style={styles.headerSub}>Secure Enterprise Assistant</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.newChatBtn} onPress={startNewChat}>
          <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Security Banner */}
      <View style={styles.securityBanner}>
        <Ionicons name="shield-checkmark" size={14} color={colors.low} />
        <Text style={styles.bannerText}>
          All conversations are monitored by AI security. PII is automatically masked.
        </Text>
      </View>

      {/* Messages */}
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="chatbubble-ellipses-outline" size={48} color={colors.textTertiary} />
              </View>
              <Text style={styles.emptyTitle}>Start a Conversation</Text>
              <Text style={styles.emptyText}>
                Ask me anything! I'm here to help with work tasks, answer questions, and provide information.
              </Text>
              <View style={styles.suggestionsContainer}>
                <Text style={styles.suggestionsTitle}>Try asking:</Text>
                {[
                  "Summarize our expense policy",
                  "Help me draft an email",
                  "What's the status of Project X?",
                ].map((suggestion, i) => (
                  <TouchableOpacity 
                    key={i} 
                    style={styles.suggestionChip}
                    onPress={() => setInput(suggestion)}
                  >
                    <Text style={styles.suggestionText}>{suggestion}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          }
        />

        {/* Input Area */}
        <View style={styles.inputContainer}>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder="Type your message..."
              placeholderTextColor={colors.textTertiary}
              multiline
              maxLength={4000}
              editable={!loading}
            />
            <TouchableOpacity 
              style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
              onPress={sendMessage}
              disabled={!input.trim() || loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.textPrimary} />
              ) : (
                <Ionicons name="send" size={18} color={colors.textPrimary} />
              )}
            </TouchableOpacity>
          </View>
          <Text style={styles.inputHint}>
            {user?.name || user?.email} • Messages are security-monitored
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  logoBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  headerSub: { color: colors.textTertiary, fontSize: 11, marginTop: 1 },
  newChatBtn: { padding: 8 },
  securityBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.lowBg,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.lowBorder,
  },
  bannerText: { color: colors.low, fontSize: 11, flex: 1 },
  messagesList: { padding: 16, paddingBottom: 8 },
  messageBubble: {
    maxWidth: "85%",
    padding: 12,
    borderRadius: 16,
    marginBottom: 12,
  },
  userBubble: {
    backgroundColor: colors.primary,
    alignSelf: "flex-end",
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: colors.card,
    alignSelf: "flex-start",
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  systemBubble: {
    backgroundColor: colors.card,
    alignSelf: "center",
    maxWidth: "90%",
    borderWidth: 1,
    borderColor: colors.border,
  },
  assistantHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  assistantName: { color: colors.primary, fontSize: 11, fontWeight: "600" },
  riskBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  riskBadgeText: { fontSize: 9, fontWeight: "700" },
  piiIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginLeft: 4,
  },
  piiText: { color: colors.medium, fontSize: 9 },
  systemHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  systemTitle: { fontSize: 12, fontWeight: "700" },
  messageText: {
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
  },
  userText: { color: "#FFFFFF" },
  systemText: { color: colors.textSecondary },
  timestamp: {
    color: colors.textTertiary,
    fontSize: 10,
    marginTop: 6,
    alignSelf: "flex-end",
  },
  inputContainer: {
    padding: 12,
    paddingBottom: Platform.OS === "ios" ? 8 : 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    paddingLeft: 16,
    paddingRight: 4,
    paddingVertical: 4,
  },
  input: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 15,
    maxHeight: 100,
    paddingVertical: 8,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { backgroundColor: colors.border },
  inputHint: {
    color: colors.textTertiary,
    fontSize: 10,
    textAlign: "center",
    marginTop: 6,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingTop: 60,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  suggestionsContainer: { width: "100%" },
  suggestionsTitle: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 10,
    letterSpacing: 1,
  },
  suggestionChip: {
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  suggestionText: { color: colors.textSecondary, fontSize: 13 },
});
