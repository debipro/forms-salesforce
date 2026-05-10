export const THEME_STORAGE_KEY = "forms-org-theme";

/** Persisted value; the resolved light/dark is what we apply to <html>. */
export type ThemePreference = "light" | "dark" | "system";

export function getResolvedTheme(pref: ThemePreference): "light" | "dark" {
  if (pref === "light" || pref === "dark") return pref;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}
