"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Settings } from "@/lib/types";

const DEFAULT_SETTINGS: Settings = {
  id: 1,
  business_name: "Awan Electronics Service Center",
  admin_name: "Admin",
  logo_url: null,
  avatar_url: null,
};

interface SettingsContextValue {
  settings: Settings;
  email: string;
  refresh: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  email: "",
  refresh: async () => {},
});

/** Loads business name, logo, profile picture and the signed-in email once for the whole app. */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [email, setEmail] = useState("");

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const [{ data }, { data: userData }] = await Promise.all([
      supabase.from("settings").select("*").eq("id", 1).maybeSingle(),
      supabase.auth.getUser(),
    ]);
    if (data) setSettings(data as Settings);
    setEmail(userData.user?.email ?? "");
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading remote data on mount
    refresh();
  }, [refresh]);

  return <SettingsContext value={{ settings, email, refresh }}>{children}</SettingsContext>;
}

export const useSettings = () => useContext(SettingsContext);
