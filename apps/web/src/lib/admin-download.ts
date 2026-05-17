import { usePlatformAdminStore } from "@/stores/platform-admin-store";

export async function adminDownloadCsv(path: string, filename: string): Promise<void> {
  const adminId = usePlatformAdminStore.getState().adminId;
  const url = new URL(path, window.location.origin);
  const res = await fetch(url.toString(), {
    headers: { "x-platform-admin-id": adminId },
  });
  if (!res.ok) {
    throw new Error(`Export failed (${res.status})`);
  }
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(href);
}
