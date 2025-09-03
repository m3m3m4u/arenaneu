// Deaktiviert: Autor-Rechte werden nicht mehr per Anfrage vergeben.
export async function POST(){
  return new Response('Author request disabled', { status:410 });
}
