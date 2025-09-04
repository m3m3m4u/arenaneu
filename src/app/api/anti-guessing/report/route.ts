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

    // Der Client ruft (laut Kommentar) nur nach jeder dritten Blockade (3,6,9,...) diese Route auf.
    // Die ursprüngliche Implementierung erwartete aber einen Aufruf NACH JEDER Blockade und
    // prüfte deshalb totalEvents % 3 === 0. Dadurch wurde bei einem Aufruf erst bei totalEvents=1
    // (entspricht 3 Blockaden) KEINE Nachricht gesendet. Ergebnis: Lehrer bekam nichts.
    // Anpassung: Wir interpretieren JEDEN Aufruf als ein "Schwellen-Report" (= 3 weitere Blockaden erreicht).
    // Somit ist die Sequenznummer einfach die Anzahl der gespeicherten Events (1 => 3 Sperren, 2 => 6 Sperren, ...).
    await AntiGuessingEvent.create({ user: user._id, class: user.class, teacher: cls.teacher });

    // Anzahl aller Schwellen-Reports für diesen Lernenden
    const totalThresholdReports = await AntiGuessingEvent.countDocuments({ user: user._id });
    const seq = totalThresholdReports; // 1,2,3,... entspricht (3,6,9,...) Blockaden
    const totalBlocksApprox = seq * 3; // Nur zur Information (heuristisch)
    const subjectPrefix = `Hinweis: Häufiges Raten (#${seq}) bei ${user.username}`;
    // Prüfen ob für diese Sequenz bereits Nachricht existiert
    const existing = await Message.findOne({
      sender: user._id,
      recipientUser: cls.teacher,
      subject: subjectPrefix
    }, '_id').lean();
    if(existing){
      return NextResponse.json({ ok:true, createdEvent:true, totalThresholdReports, notified:false, duplicate:true, seq });
    }
    const body = `Automatische Meldung (Anti-Raten-Schutz):\n\nDer Lernende "${user.username}" wurde mittlerweile ca. ${totalBlocksApprox} mal (in 3er-Schwellen gezählt) wegen sehr schneller falscher Antworten kurzzeitig blockiert (möglicherweise Raten).\n\nDies ist Meldung #${seq} (Client meldet jede 3. Sperre).\n\nEmpfehlung: Lernstand / Verständnis prüfen oder Rückfrage stellen.`;
    await Message.create({ sender: user._id, recipientUser: cls.teacher, subject: subjectPrefix, body });
    return NextResponse.json({ ok:true, createdEvent:true, totalThresholdReports, notified:true, seq });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || 'server error' }, { status:500 });
  }
}
