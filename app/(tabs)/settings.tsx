import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { haptic } from "@/lib/haptics";
import { getProfileName, saveProfileName } from "@/lib/room-storage";

export default function SettingsScreen() {
  const [name, setName] = useState("");
  useEffect(() => { getProfileName().then((saved) => saved && setName(saved)); }, []);
  const save = async () => {
    if (name.trim().length < 2) { haptic.error(); Alert.alert("Name is too short", "Enter at least two characters."); return; }
    await saveProfileName(name.trim()); haptic.success(); Alert.alert("Saved", "This name will be shown when you join new rooms.");
  };
  return (
    <ScreenContainer className="px-5"><ScrollView contentContainerStyle={styles.content}><Text style={styles.eyebrow}>SETTINGS</Text><Text style={styles.title}>Identity & Privacy</Text><Text style={styles.label}>DISPLAY NAME</Text><TextInput value={name} onChangeText={setName} placeholder="Your name in rooms" placeholderTextColor="#74869C" textAlign="left" style={styles.input} returnKeyType="done" /><Pressable onPress={save} style={({ pressed }) => [styles.button, pressed && styles.pressed]}><Text style={styles.buttonText}>SAVE NAME</Text></Pressable><View style={styles.privacy}><Text style={styles.privacyTitle}>SESSION PRIVACY</Text><Text style={styles.privacyText}>Your room membership token is stored securely on this device. The app never carries or uploads game files to the service.</Text></View><View style={styles.info}><Text style={styles.infoLabel}>INTERFACE VERSION</Text><Text style={styles.infoValue}>Private room preview</Text></View></ScrollView></ScreenContainer>
  );
}

const styles = StyleSheet.create({ content: { paddingTop: 17, paddingBottom: 28 }, eyebrow: { color: "#62C2EB", fontSize: 13, fontWeight: "900", letterSpacing: 0.8 }, title: { color: "#F3F7FB", fontSize: 29, fontWeight: "900", marginTop: 5 }, label: { color: "#DCE7F1", fontSize: 15, fontWeight: "800", marginTop: 26, marginBottom: 9 }, input: { backgroundColor: "#1D2A3C", borderRadius: 14, borderWidth: 1, borderColor: "#30445E", minHeight: 52, paddingHorizontal: 14, color: "#F3F7FB", fontSize: 16 }, button: { minHeight: 50, borderRadius: 15, backgroundColor: "#146C94", alignItems: "center", justifyContent: "center", marginTop: 12 }, buttonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" }, privacy: { backgroundColor: "#162235", borderRadius: 16, padding: 15, marginTop: 26 }, privacyTitle: { color: "#F4C662", fontSize: 14, fontWeight: "900" }, privacyText: { color: "#B4C2D0", fontSize: 13, lineHeight: 20, marginTop: 5 }, info: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 19, borderBottomWidth: 1, borderBottomColor: "#30445E" }, infoLabel: { color: "#DCE7F1", fontSize: 14, fontWeight: "800" }, infoValue: { color: "#8398AC", fontSize: 13 }, pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] } });
