import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import User from '@/models/User';
import TeacherClass from '@/models/TeacherClass';
import Message from '@/models/Message';
import AntiGuessingEvent from '@/models/AntiGuessingEvent';

/*
  POST /api/anti-guessing/report
  Body: { username: string }

  Client sendet diesen Report nach jeder dritten Blockade (3,6,9,...). Für JEDE
  dritte Blockade wird jetzt eine Nachricht an die zugehörige Lehrperson gesendet
  (sofern Lernender einer Klasse + Teacher zugeordnet). Betreff enthält eine
  Sequenznummer (#1 = 3 Sperren, #2 = 6 Sperren, ...). Eine Nachricht pro Schwelle.
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

    // Event protokollieren (jede Blockade)
    await AntiGuessingEvent.create({ user: user._id, class: user.class, teacher: cls.teacher });

    // Anzahl aller Block-Events für diesen Lernenden (nach Anlage dieses Events)
    const totalEvents = await AntiGuessingEvent.countDocuments({ user: user._id });
    const thresholdReached = totalEvents >=3 && totalEvents % 3 === 0; // 3,6,9,...
    if(!thresholdReached){
      return NextResponse.json({ ok:true, createdEvent:true, totalEvents, thresholdReached:false, notified:false });
    }
    // Sequenznummer bestimmen (3=>1, 6=>2, ...)
    const seq = Math.floor(totalEvents/3);
    // Prüfen ob für diese Sequenz bereits Nachricht existiert
    const subjectPrefix = `Hinweis: Häufiges Raten (#${seq}) bei ${user.username}`;
    const existing = await Message.findOne({
      sender: user._id,
      recipientUser: cls.teacher,
      subject: subjectPrefix
    }, '_id').lean();
    if(existing){
      return NextResponse.json({ ok:true, createdEvent:true, totalEvents, thresholdReached:true, notified:false, duplicate:true });
    }
    const body = `Automatische Meldung (Anti-Raten-Schutz):\n\nDer Lernende "${user.username}" wurde mittlerweile ${totalEvents} mal wegen sehr schneller falscher Antworten kurzzeitig blockiert (möglicherweise Raten).\n\nDies ist Meldung #${seq} (je 3 Sperren eine Meldung).\n\nEmpfehlung: Lernstand / Verständnis prüfen oder Rückfrage stellen.`;
    await Message.create({ sender: user._id, recipientUser: cls.teacher, subject: subjectPrefix, body });
    return NextResponse.json({ ok:true, createdEvent:true, totalEvents, thresholdReached:true, notified:true, seq });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || 'server error' }, { status:500 });
  }
}
