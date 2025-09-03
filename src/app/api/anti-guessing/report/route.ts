import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import User from '@/models/User';
import TeacherClass from '@/models/TeacherClass';
import Message from '@/models/Message';
import AntiGuessingEvent from '@/models/AntiGuessingEvent';

/*
  POST /api/anti-guessing/report
  Body: { username: string }
  Client meldet nur jeden 3. Block (min. 5s Abstand). Wir speichern jedes Event
  und senden höchstens 1 Hinweis / Stunde pro Lernenden an den Teacher.
*/

const COOLDOWN_MS = 60 * 60 * 1000; // 1h

export async function POST(req: Request){
  try {
    const { username } = await req.json();
    if(!username) return NextResponse.json({ ok:false, error:'username fehlt' }, { status:400 });
    await dbConnect();
    const user = await User.findOne({ username }, '_id username class').lean();
    if(!user) return NextResponse.json({ ok:false, error:'user nicht gefunden' }, { status:404 });
    if(!user.class) return NextResponse.json({ ok:true, skipped:true, reason:'keine_klasse' });
    const cls = await TeacherClass.findById(user.class, 'teacher').lean();
    if(!cls?.teacher) return NextResponse.json({ ok:true, skipped:true, reason:'kein_teacher' });

    // Event protokollieren
    await AntiGuessingEvent.create({ user: user._id, class: user.class, teacher: cls.teacher });

    // Bereits kürzlich Nachricht gesendet?
    const since = new Date(Date.now() - COOLDOWN_MS);
    const recent = await Message.findOne({
      sender: user._id,
      recipientUser: cls.teacher,
      subject: { $regex: /^Hinweis: Häufiges Raten bei /i },
      createdAt: { $gte: since }
    }, '_id').lean();
    if(recent){
      return NextResponse.json({ ok:true, createdEvent:true, throttled:true });
    }

  const subject = `Hinweis: Häufiges Raten bei ${user.username}`;
  const body = `Der Lernende "${user.username}" hat wiederholt innerhalb kurzer Zeit falsche Antworten gegeben und wurde durch die Anti-Raten-Sperre gebremst.\n\nEmpfehlung: Lernstand / Verständnis klären oder kurze Rückfrage stellen. (Automatische Systemnachricht)`;
  await Message.create({ sender: user._id, recipientUser: cls.teacher, subject, body });
  return NextResponse.json({ ok:true, createdEvent:true, notified:true });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || 'server error' }, { status:500 });
  }
}
