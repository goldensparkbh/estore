import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { applyDocumentTheme, readPlatformTheme, type UiTheme } from "@/lib/theme";
import { useUiStore } from "@/stores/ui-store";

/** Applies the tenant workspace theme from account settings. */
export function TenantThemeSync(): null {
  const setTheme = useUiStore((s) => s.setTheme);
  const me = useQuery({
    queryKey: ["account-me"],
    queryFn: () =>
      apiFetch<{ data: { tenant: { uiTheme: UiTheme } } }>("/v1/account/me"),
  });

  useEffect(() => {
    const theme = me.data?.data?.tenant?.uiTheme;
    if (theme === "light" || theme === "dark") {
      setTheme(theme);
    }
  }, [me.data?.data?.tenant?.uiTheme, setTheme]);

  return null;
}

/** Applies platform operator theme from browser storage (default light). */
export function PlatformThemeSync(): null {
  const setTheme = useUiStore((s) => s.setTheme);

  useEffect(() => {
    setTheme(readPlatformTheme());
  }, [setTheme]);

  return null;
}

/** Applies theme on public store pages; resets to light when leaving. */
export function StoreThemeEffect(props: { uiTheme: UiTheme | undefined }): null {
  useEffect(() => {
    const theme = props.uiTheme ?? "light";
    applyDocumentTheme(theme);
    return () => applyDocumentTheme("light");
  }, [props.uiTheme]);

  return null;
}
