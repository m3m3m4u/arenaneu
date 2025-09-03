import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import User from '@/models/User';
import PasswordResetToken from '@/models/PasswordResetToken';
import { compare, hash } from 'bcryptjs';
import AuditLog from '@/models/AuditLog';

// POST /api/auth/password-reset/confirm { token, userId, password }
export async function POST(req: Request){
  try {
    const { token, userId, password } = await req.json();
    if(!token || !userId || !password) return NextResponse.json({ ok:false, error:'Fehlende Daten' }, { status:400 });
    if(password.length < 6) return NextResponse.json({ ok:false, error:'Passwort zu kurz' }, { status:400 });
    await dbConnect();
    const entry = await PasswordResetToken.findOne({ userId });
    if(!entry) return NextResponse.json({ ok:false, error:'Token ungültig' }, { status:400 });
    if(entry.expiresAt < new Date()) { await entry.deleteOne(); return NextResponse.json({ ok:false, error:'Token abgelaufen' }, { status:400 }); }
    const valid = await compare(token, entry.tokenHash);
    if(!valid) return NextResponse.json({ ok:false, error:'Token ungültig' }, { status:400 });
  const pwHash = await hash(password, 12);
	await User.updateOne({ _id: userId }, { $set: { password: pwHash }, $inc: { tokenVersion: 1 } });
  try { await AuditLog.create({ action:'auth.passwordReset.confirm', targetType:'user', targetId: userId }); } catch {}
    await PasswordResetToken.deleteMany({ userId });
    return NextResponse.json({ ok:true });
  } catch(e){
    console.error('password-reset confirm error', e);
    return NextResponse.json({ ok:false, error:'Fehler' }, { status:500 });
  }
}
