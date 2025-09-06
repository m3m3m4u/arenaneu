export const revalidate = 31536000; // 1 Jahr, als Literal

export async function GET() {
  // Platzhalter-Route (nicht mehr verwendet). Liefert 204 No Content.
  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
