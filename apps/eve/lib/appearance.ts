export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "sofie.appearance.theme";
export const THEME_CHANGE_EVENT = "sofie:theme-change";

export function isThemePreference(value: string | null): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function readThemePreference(storage: Storage = window.localStorage): ThemePreference {
  const stored = storage.getItem(THEME_STORAGE_KEY);
  return isThemePreference(stored) ? stored : "system";
}

export function resolvedTheme(preference: ThemePreference, media: MediaQueryList): "light" | "dark" {
  return preference === "system" ? (media.matches ? "dark" : "light") : preference;
}

export function applyThemePreference(preference: ThemePreference): void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  document.documentElement.dataset.mode = resolvedTheme(preference, media);
  document.documentElement.style.colorScheme = resolvedTheme(preference, media);
}

export function saveThemePreference(preference: ThemePreference): void {
  window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  applyThemePreference(preference);
  window.dispatchEvent(new CustomEvent<ThemePreference>(THEME_CHANGE_EVENT, { detail: preference }));
}
