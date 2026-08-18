import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { Socket } from "socket.io-client";

type ChatMessage = { id: string; memberId: number; displayName: string; text: string; sentAt: number };

export function RoomChat({ socket, title = "ROOM CHAT" }: { socket: Socket | null; title?: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!socket) return;
    const receive = (message: ChatMessage) => setMessages((current) => [...current.slice(-15), message]);
    socket.on("netplay:chat", receive);
    return () => {
      socket.off("netplay:chat", receive);
    };
  }, [socket]);

  const send = () => {
    const text = draft.trim();
    if (!text || !socket?.connected) return;
    socket.emit("netplay:chat", { text });
    setDraft("");
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.messages}>
        {messages.length ? messages.slice(-4).map((message) => <Text key={message.id} style={styles.message}><Text style={styles.sender}>{message.displayName}: </Text>{message.text}</Text>) : <Text style={styles.empty}>{socket?.connected ? "Send a message to the room." : "Connect to the room channel to enable chat."}</Text>}
      </View>
      <View style={styles.composer}>
        <TextInput value={draft} onChangeText={setDraft} editable={Boolean(socket?.connected)} placeholder="Write a message…" placeholderTextColor="#71839A" style={styles.input} textAlign="left" returnKeyType="send" onSubmitEditing={send} />
        <Pressable onPress={send} disabled={!socket?.connected || !draft.trim()} style={({ pressed }) => [styles.send, (!socket?.connected || !draft.trim() || pressed) && styles.sendDisabled]}><Text style={styles.sendText}>SEND</Text></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#101D2E", borderWidth: 1, borderColor: "#29415B", borderRadius: 16, padding: 13, marginTop: 16 },
  title: { color: "#F4C662", fontSize: 13, fontWeight: "900", textAlign: "left" },
  messages: { minHeight: 48, justifyContent: "center", marginTop: 8 },
  message: { color: "#D5E1EB", fontSize: 12, lineHeight: 19, textAlign: "left" },
  sender: { color: "#62C2EB", fontWeight: "900" },
  empty: { color: "#879AAF", fontSize: 12, textAlign: "left" },
  composer: { flexDirection: "row", gap: 8, marginTop: 10 },
  input: { flex: 1, minHeight: 42, borderRadius: 12, color: "#F3F7FB", backgroundColor: "#08111F", borderWidth: 1, borderColor: "#304B67", paddingHorizontal: 11, fontSize: 13 },
  send: { minWidth: 72, minHeight: 42, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#146C94" },
  sendDisabled: { opacity: 0.45 },
  sendText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
});
