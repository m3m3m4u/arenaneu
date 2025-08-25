import { NextResponse } from 'next/server';
import { exportUserActivity } from '@/lib/requestMetrics';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';

// Liefert pseudo "Verbindungsnutzung" pro Benutzer basierend auf API Request Aktivität (letzte 5-60 Minuten)
export async function GET(req: Request){
  const url = new URL(req.url);
  const windowParam = url.searchParams.get('window');
  const minutes = Math.min(60, Math.max(1, Number(windowParam || '5')));
  const session: any = await getServerSession(authOptions as any);
  if(!session || !session.user || session.user.role !== 'admin'){
    return new NextResponse(JSON.stringify({ error: 'forbidden' }), { status: 403 });
  }
  const data = exportUserActivity(minutes);
  return NextResponse.json(data);
}
