"use client";

import { useEffect } from "react";

import {
  applyThemePreference,
  readThemePreference,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "@/lib/appearance";

export function AppearanceSync() {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => applyThemePreference(readThemePreference());
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) sync();
    };
    const onThemeChange = (event: Event) => {
      applyThemePreference((event as CustomEvent<ThemePreference>).detail);
    };

    sync();
    media.addEventListener("change", sync);
    window.addEventListener("storage", onStorage);
    window.addEventListener(THEME_CHANGE_EVENT, onThemeChange);
    return () => {
      media.removeEventListener("change", sync);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(THEME_CHANGE_EVENT, onThemeChange);
    };
  }, []);

  return null;
}
