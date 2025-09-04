import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import User from '@/models/User';
import TeacherClass from '@/models/TeacherClass';
import Message from '@/models/Message';
import AntiGuessingEvent from '@/models/AntiGuessingEvent';

/*
  POST /api/anti-guessing/report
  Body: { username: string }

  Aktuelle Client-Implementierung (useAntiGuessing) ruft dieses Endpoint bei JEDER
  Blockade (nach maxWrong schnellen Fehlversuchen) mit min. 5s Abstand auf.

  Ziel-Anforderung: Erst NACH 3 Blockaden (also beim 3., 6., 9. ... Ereignis) soll
  automatisch eine interne Nachricht an die Lehrperson gehen. Wir speichern daher
  jedes Block-Ereignis (AntiGuessingEvent) und senden nur bei totalEvents % 3 === 0
  eine Message. Die Sequenznummer seq = totalEvents / 3 (1 => 3 Blockaden, 2 => 6 ...).

  Idempotenz: Duplikate werden über (sender, recipientUser, subject) verhindert.
*/

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

    // Ereignis immer speichern
    await AntiGuessingEvent.create({ user: user._id, class: user.class, teacher: cls.teacher });

    const totalEvents = await AntiGuessingEvent.countDocuments({ user: user._id });
    // Nur bei jeder dritten Blockade Benachrichtigung
    if(totalEvents % 3 !== 0){
      return NextResponse.json({ ok:true, createdEvent:true, notified:false, totalEvents });
    }
    const seq = totalEvents / 3; // 1 => 3 Blockaden, 2 => 6 ...
    const totalBlocksApprox = totalEvents; // reale Anzahl gespeicherter Blockaden
    const subjectPrefix = `Hinweis: Häufiges Raten (#${seq}) bei ${user.username}`;
    const existing = await Message.findOne({ sender: user._id, recipientUser: cls.teacher, subject: subjectPrefix }, '_id').lean();
    if(existing){
      return NextResponse.json({ ok:true, createdEvent:true, notified:false, duplicate:true, seq, totalEvents });
    }
    const body = `Automatische Meldung (Anti-Raten-Schutz):\n\nDer Lernende "${user.username}" wurde mittlerweile ${totalEvents} mal sehr schnell mit falschen Antworten geblockt (möglicherweise Raten).\n\nDies ist Meldung #${seq} (ausgelöst nach jeweils 3 Blockaden).\n\nEmpfehlung: Lernstand / Verständnis prüfen oder Rückfrage stellen.`;
    await Message.create({ sender: user._id, recipientUser: cls.teacher, subject: subjectPrefix, body });
    return NextResponse.json({ ok:true, createdEvent:true, notified:true, seq, totalEvents });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || 'server error' }, { status:500 });
  }
}
