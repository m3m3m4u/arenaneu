import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import User from '@/models/User';
import TeacherClass from '@/models/TeacherClass';
import Message from '@/models/Message';
import AntiGuessingEvent from '@/models/AntiGuessingEvent';

/*
  POST /api/anti-guessing/report
  Body: { username: string }

  Client meldet GENAU jeden 3. Block (=> 3 Sperren = 1 Report). Beim ERSTEN Report
  wird automatisch eine Nachricht an die Lehrperson gesendet (falls vorhanden).
  Weitere Reports (6, 9, … Sperren) erzeugen zwar Events (Analytics), aber KEINE
  weiteren Nachrichten mehr – so bleibt Spam aus.
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

    // Bereits Nachricht gesendet?
    const existing = await Message.findOne({
      sender: user._id,
      recipientUser: cls.teacher,
      subject: { $regex: /^Hinweis: Häufiges Raten bei /i }
    }, '_id').lean();

    // Anzahl aller Block-Events für diesen Lernenden
    const totalEvents = await AntiGuessingEvent.countDocuments({ user: user._id });
    if(existing || totalEvents < 3){
      return NextResponse.json({ ok:true, createdEvent:true, totalEvents, alreadyNotified: !!existing, thresholdReached: totalEvents>=3 });
    }

    const subject = `Hinweis: Häufiges Raten bei ${user.username}`;
    const body = `Automatische Meldung (Anti-Raten-Schutz):\n\nDer Lernende "${user.username}" wurde jetzt mindestens 3-mal wegen sehr schneller falscher Antworten kurzzeitig blockiert (Hinweis auf mögliches Raten).\n\nEmpfehlung: Lernstand / Verständnis prüfen oder Rückfrage stellen. (Einmalige Systemnachricht)`;
    await Message.create({ sender: user._id, recipientUser: cls.teacher, subject, body });
    return NextResponse.json({ ok:true, createdEvent:true, totalEvents, notified:true });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || 'server error' }, { status:500 });
  }
}
