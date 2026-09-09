import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export type RoomCredential = {
  roomId: number;
  memberId: number;
  memberToken: string;
};

const profileKey = "moudie.profile.name";
const profileIdKey = "moudie.profile.id";
const profileAvatarKey = "moudie.profile.avatar";
const languageKey = "moudie.profile.language";
const roomKey = (roomId: number) => `moudie.room.${roomId}`;

async function setValue(key: string, value: string) {
  if (Platform.OS === "web") {
    sessionStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function getValue(key: string) {
  if (Platform.OS === "web") return sessionStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}

export async function saveProfileName(name: string) {
  await setValue(profileKey, name.trim());
}

export async function getProfileName() {
  return getValue(profileKey);
}

export async function saveProfileId(id: string) { await setValue(profileIdKey, id.trim().toUpperCase()); }
export async function getProfileId() { return getValue(profileIdKey); }
export async function ensureProfileId() {
  const existing = await getProfileId();
  if (existing) return existing;
  // Six trailing digits preserve chronological ordering on a device; a global
  // sequential identity requires the authenticated server user table.
  const generated = `MN-3${String(Math.floor(Date.now() / 1000) % 1_000_000).padStart(6, "0")}`;
  await saveProfileId(generated);
  return generated;
}
export async function saveProfileAvatar(uri: string) { await setValue(profileAvatarKey, uri); }
export async function getProfileAvatar() { return getValue(profileAvatarKey); }
export async function saveLanguage(language: "ar" | "en" | "fr") { await setValue(languageKey, language); }
export async function getLanguage(): Promise<"ar" | "en" | "fr"> { return ((await getValue(languageKey)) as "ar" | "en" | "fr" | null) ?? "en"; }

export async function saveRoomCredential(credential: RoomCredential) {
  await setValue(roomKey(credential.roomId), JSON.stringify(credential));
}

export async function getRoomCredential(roomId: number): Promise<RoomCredential | null> {
  const value = await getValue(roomKey(roomId));
  if (!value) return null;
  try {
    return JSON.parse(value) as RoomCredential;
  } catch {
    return null;
  }
}
