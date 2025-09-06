import { readFile } from "fs/promises";

export const revalidate = 60 * 60 * 24 * 365; // 1 Jahr

export async function GET() {
  // Lies die bestehende Datei aus dem Repo (keine Node-Typen nötig)
  const fileUrl = new URL("../LA_Logo.png", import.meta.url);
  const file = await readFile(fileUrl);
  const blob = new Blob([new Uint8Array(file)], { type: "image/png" });
  return new Response(blob, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
