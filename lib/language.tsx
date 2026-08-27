import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type AppLanguage = "en";
const STORAGE_KEY = "moudie.language.v1";

type LanguageContextValue = {
  language: AppLanguage | null;
  ready: boolean;
  setLanguage: (language: AppLanguage) => Promise<void>;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language] = useState<AppLanguage>("en");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Remove a legacy per-device language preference so previous Arabic
    // selections cannot reappear after upgrading to the English-only UI.
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined).finally(() => setReady(true));
  }, []);

  const setLanguage = useCallback(async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  const value = useMemo(() => ({ language, ready, setLanguage }), [language, ready, setLanguage]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("useLanguage must be used inside LanguageProvider");
  return value;
}
