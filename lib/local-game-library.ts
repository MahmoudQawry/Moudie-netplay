import AsyncStorage from "@react-native-async-storage/async-storage";

export type LocalSystem = "nes" | "sega" | "ps1" | "psp";

export type LocalGame = {
  id: string;
  system: LocalSystem;
  name: string;
  uri: string;
  size: number | null;
  importedAt: string;
};

const STORAGE_KEY = "moudie.local-games.v1";

export const SYSTEM_META: Record<LocalSystem, { title: string; subtitle: string; extensions: string; color: string; symbol: string }> = {
  nes: { title: "Famicom", subtitle: "NES · أزرار A / B", extensions: ".nes", color: "#F4B942", symbol: "▦" },
  sega: { title: "Sega", subtitle: "Genesis · Mega Drive", extensions: ".gen · .md · .smd · .bin", color: "#F26B5B", symbol: "◆" },
  ps1: { title: "PlayStation 1", subtitle: "PS1 · ملفات محلية", extensions: ".cue · .bin · .chd · .pbp", color: "#9F8DF5", symbol: "○" },
  psp: { title: "PlayStation Portable", subtitle: "PSP · ملفات محلية", extensions: ".iso · .cso · .pbp", color: "#62C2EB", symbol: "△" },
};

export function isExtensionAllowed(system: LocalSystem, name: string): boolean {
  const lower = name.trim().toLowerCase();
  const extensions: Record<LocalSystem, string[]> = {
    nes: [".nes"],
    sega: [".gen", ".md", ".smd", ".bin"],
    ps1: [".cue", ".bin", ".chd", ".pbp"],
    psp: [".iso", ".cso", ".pbp"],
  };
  return extensions[system].some((extension) => lower.endsWith(extension));
}

function createId() {
  return `game_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function listLocalGames(): Promise<LocalGame[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as LocalGame[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function importLocalGame(input: Omit<LocalGame, "id" | "importedAt">): Promise<LocalGame> {
  const games = await listLocalGames();
  const existing = games.find((game) => game.uri === input.uri && game.system === input.system);
  if (existing) return existing;
  const game: LocalGame = { ...input, id: createId(), importedAt: new Date().toISOString() };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([game, ...games]));
  return game;
}

export async function removeLocalGame(id: string): Promise<void> {
  const games = await listLocalGames();
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(games.filter((game) => game.id !== id)));
}

export async function listGamesForSystem(system: LocalSystem): Promise<LocalGame[]> {
  return (await listLocalGames()).filter((game) => game.system === system);
}
