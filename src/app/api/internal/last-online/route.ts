import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import User from '@/models/User';

// Diese Route wird vom Edge-Middleware Ping (fetch) aufgerufen, um lastOnline zu speichern.
// Sie läuft im Node.js Runtime (nicht Edge) und darf mongoose verwenden.
// Sicherheit: Einfache Header-Prüfung + Username Validierung + Throttling redundanzfrei erlaubt.

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const username = (url.searchParams.get('u') || '').trim();
    if (!username || username.length > 64) {
      return NextResponse.json({ ok: false, reason: 'bad-username' }, { status: 400 });
    }
    // Optionaler Schutz: Header prüfen (kein echter Secret-Ersatz, aber verhindert Fremdspam)
    const hdr = request.headers.get('x-internal-lastonline') || '';
    if (process.env.ADMIN_API_KEY && hdr !== process.env.ADMIN_API_KEY) {
      return NextResponse.json({ ok: false, reason: 'forbidden' }, { status: 403 });
    }

    if (!process.env.MONGODB_URI) {
      return NextResponse.json({ ok: false, reason: 'no-db' }, { status: 503 });
    }

    await dbConnect();
    await User.updateOne({ username }, { $set: { lastOnline: new Date() } }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
