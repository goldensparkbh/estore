export type UiTheme = "light" | "dark";

export const PLATFORM_THEME_KEY = "erp-platform-theme";

export function applyDocumentTheme(theme: UiTheme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function parseUiTheme(value: string | null | undefined): UiTheme {
  return value === "dark" ? "dark" : "light";
}

export function readPlatformTheme(): UiTheme {
  if (typeof localStorage === "undefined") return "light";
  return localStorage.getItem(PLATFORM_THEME_KEY) === "dark" ? "dark" : "light";
}

export function savePlatformTheme(theme: UiTheme): void {
  localStorage.setItem(PLATFORM_THEME_KEY, theme);
}
