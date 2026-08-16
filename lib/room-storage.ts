import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export type RoomCredential = {
  roomId: number;
  memberId: number;
  memberToken: string;
  hostToken?: string;
};

const profileKey = "moudie.profile.name";
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
