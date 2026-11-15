/**
 * Theme preference: per device, in localStorage. "system" follows the phone.
 * `THEME_BOOT_SCRIPT` runs inline in <head> before paint so there is no flash.
 */
export type ThemePreference = "system" | "light" | "dark";

export const THEME_KEY = "slate-theme";
export const THEME_COLORS = { light: "#faf7f2", dark: "#0f0e0d" } as const;

export function isThemePreference(v: unknown): v is ThemePreference {
  return v === "system" || v === "light" || v === "dark";
}

export function readThemePreference(): ThemePreference {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return isThemePreference(v) ? v : "system";
  } catch {
    return "system";
  }
}

/** Resolves what is actually on screen for a preference. */
export function resolvedTheme(pref: ThemePreference): "light" | "dark" {
  if (pref !== "system") return pref;
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const CHANGE_EVENT = "slate-theme-change";

export function applyThemePreference(pref: ThemePreference): void {
  const root = document.documentElement;
  if (pref === "system") delete root.dataset.theme;
  else root.dataset.theme = pref;
  try {
    if (pref === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {
    // Private mode or blocked storage: the choice still applies for this visit.
  }
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])') ?? createThemeColorMeta();
  meta.content = THEME_COLORS[resolvedTheme(pref)];
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** For useSyncExternalStore: fires on local changes and on other tabs' storage writes. */
export function subscribeTheme(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function createThemeColorMeta(): HTMLMetaElement {
  const meta = document.createElement("meta");
  meta.name = "theme-color";
  document.head.appendChild(meta);
  return meta;
}

/** Inline boot script: applies the stored preference before first paint. */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t;}}catch(e){}})();`;
