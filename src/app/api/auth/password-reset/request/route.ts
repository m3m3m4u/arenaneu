import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import User from '@/models/User';
import PasswordResetToken from '@/models/PasswordResetToken';
import crypto from 'crypto';
import { hash } from 'bcryptjs';
import { rateLimit } from '@/lib/rateLimit';
import AuditLog from '@/models/AuditLog';
import { sendMail } from '@/lib/mailer';

// POST /api/auth/password-reset/request { email? , identifier? }
// "identifier" kann entweder E-Mail oder Benutzername sein. E-Mail bleibt optional im System.
export async function POST(req: Request){
  try {
  const body = await req.json().catch(()=>({}));
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'ip:unknown';
    const rawIdentifier: string | undefined = body?.identifier || body?.email;
    if(!rateLimit(`pwreq:${ip}`, { capacity: 5, refillPerSec: 0.05 })){
      return NextResponse.json({ ok:true }); // silent throttle
    }
    if(!rawIdentifier) return NextResponse.json({ ok: true }); // silent
    await dbConnect();
    let user = null;
    if(rawIdentifier.includes('@')){
      user = await User.findOne({ email: rawIdentifier.toLowerCase() });
    } else {
      user = await User.findOne({ username: rawIdentifier });
    }
  if(!user) return NextResponse.json({ ok: true }); // silent
  // Audit log (generic, no enumeration data leaked)
  try { await AuditLog.create({ action:'auth.passwordReset.request', user: user.username, targetType:'user', targetId: String(user._id) }); } catch {}
    // Vorherige Tokens löschen
    await PasswordResetToken.deleteMany({ userId: user._id });
  const rawToken = (crypto as any).randomBytes(32).toString('hex');
    const tokenHash = await hash(rawToken, 10);
    const expiresAt = new Date(Date.now() + 1000*60*30); // 30min
    await PasswordResetToken.create({ userId: user._id, tokenHash, expiresAt });
  const base = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
    const link = `${base}/reset-password?token=${rawToken}&u=${user._id}`;
  // TODO: E-Mail Versand. Wenn keine E-Mail beim User hinterlegt ist -> kein Versand möglich.
    const dev = process.env.NODE_ENV !== 'production';
    if (user.email) {
      // Template sehr simpel gehalten
      const subject = 'Passwort zurücksetzen';
      const text = `Hallo ${user.username},\n\nDu hast (oder jemand hat) das Zurücksetzen deines Passworts angefordert.\n\nNutze diesen Link (30 Minuten gültig):\n${link}\n\nWenn du dies nicht warst, ignoriere die Mail.\n\nViele Grüße`;
      const html = `<p>Hallo <strong>${user.username}</strong>,</p><p>Du hast (oder jemand hat) das Zurücksetzen deines Passworts angefordert.</p><p><a href="${link}">Passwort jetzt zurücksetzen</a></p><p>Der Link ist 30 Minuten gültig.</p><p>Wenn du dies nicht warst, ignoriere die Mail.</p><p>Viele Grüße</p>`;
      await sendMail({ to: user.email, subject, text, html });
    }
    if (dev) {
      // In Dev weiterhin Link zurückgeben für schnellere Tests
      return NextResponse.json({ ok: true, resetLink: link, sent: !!user.email });
    }
    return NextResponse.json({ ok: true, sent: !!user.email });
  } catch(e){
    console.error('password-reset request error', e);
    return NextResponse.json({ ok:false, error:'Fehler' }, { status:500 });
  }
}
