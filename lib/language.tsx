import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type AppLanguage = "ar" | "en";
const STORAGE_KEY = "moudie.language.v1";

type LanguageContextValue = {
  language: AppLanguage | null;
  ready: boolean;
  setLanguage: (language: AppLanguage) => Promise<void>;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (!cancelled) setLanguageState(value === "ar" || value === "en" ? value : null);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => { cancelled = true; };
  }, []);

  const setLanguage = useCallback(async (next: AppLanguage) => {
    setLanguageState(next);
    await AsyncStorage.setItem(STORAGE_KEY, next);
  }, []);

  const value = useMemo(() => ({ language, ready, setLanguage }), [language, ready, setLanguage]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("useLanguage must be used inside LanguageProvider");
  return value;
}
