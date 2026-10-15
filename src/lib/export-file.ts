"use client";

/* ============================================================
   oniLibrary — file export helpers (round 11)
   Shared by the backup screen and the notes & highlights
   manager: inside the APK the WebView can't download anchors,
   so payloads go through the native bridge (MediaStore
   Downloads / share sheet) when available (round 9).
   ============================================================ */

/* UTF-8 → base64 (chunked to avoid stack overflow on big payloads) */
export function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/* hand the payload to the native bridge; false when unavailable/failed */
export function nativeExport(name: string, mime: string, bytes: Uint8Array): boolean {
  const bridge = (
    window as unknown as {
      OniAndroid?: { exportFile?: (b64: string, n: string, m: string) => string };
    }
  ).OniAndroid;
  if (!bridge?.exportFile) return false;
  try {
    return bridge.exportFile(toBase64(bytes), name, mime.split(";")[0]) !== "error";
  } catch {
    return false;
  }
}

/* download via the native bridge when inside the APK, else via an anchor */
export function downloadFile(name: string, mime: string, content: string): void {
  const bytes = new TextEncoder().encode(content);
  if (nativeExport(name, mime, bytes)) return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* CSV quoting: wrap when the value contains comma, quote or newline */
export function csvEscape(v: string | number): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/* rows → UTF-8-BOM CSV (Excel-friendly) */
export function toCsv(rows: (string | number)[][]): string {
  return "\uFEFF" + rows.map((r) => r.map(csvEscape).join(",")).join("\n");
}
