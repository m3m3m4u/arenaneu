import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import User from '@/models/User';
import TeacherClass from '@/models/TeacherClass';
import AntiGuessingEvent from '@/models/AntiGuessingEvent';
import Message from '@/models/Message';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';

export const runtime = 'nodejs';

/*
  DEBUG / SELBSTTEST
  GET /api/anti-guessing/self-test?username=NAME&cycles=3
  Nur für eingeloggte admin / teacher. Simuliert mehrfaches Aufrufen des Report-Endpunkts
  und gibt strukturierte Infos zurück, ob bei jedem 3. Event eine Nachricht entsteht.

  Nutzung: Browser öffnen (eingeloggt als Lehrer/Admin):
    /api/anti-guessing/self-test?username=schueler1

  Ergebnis zeigt pro Schritt ob notified.

  Optional: &reset=1 löscht vorher alle Events + passenden Nachrichten (nur Betreff-Matches) für sauberen Test.
*/

export async function GET(req: Request){
  try {
    await dbConnect();
    const session: any = await getServerSession(authOptions as any);
    const role = session?.user?.role;
    if(!session || !['admin','teacher'].includes(role)){
      return NextResponse.json({ success:false, error:'Kein Zugriff' }, { status:403 });
    }
    const url = new URL(req.url);
    const username = (url.searchParams.get('username')||'').trim();
    const cycles = Math.min(15, Math.max(1, parseInt(url.searchParams.get('cycles')||'3',10)));
    const doReset = url.searchParams.get('reset')==='1';
    if(!username){ return NextResponse.json({ success:false, error:'username parameter fehlt' }, { status:400 }); }
    const user = await User.findOne({ username }, '_id username class');
    if(!user){ return NextResponse.json({ success:false, error:'User nicht gefunden' }, { status:404 }); }
    if(!user.class){ return NextResponse.json({ success:false, error:'User ohne class (Abbruch)', reason:'no_class' }, { status:400 }); }
    const cls = await TeacherClass.findById(user.class, 'teacher');
    if(!cls?.teacher){ return NextResponse.json({ success:false, error:'Klasse ohne teacher', reason:'no_teacher' }, { status:400 }); }

    if(doReset){
      await AntiGuessingEvent.deleteMany({ user: user._id });
      await Message.deleteMany({ sender: user._id, recipientUser: cls.teacher, subject: /Häufiges Raten/ });
    }

    const preCount = await AntiGuessingEvent.countDocuments({ user: user._id });
    const steps: any[] = [];

    for(let i=1;i<=cycles;i++){
      // EIN EVENT ERZEUGEN
      await AntiGuessingEvent.create({ user: user._id, class: user.class, teacher: cls.teacher });
      const totalEvents = await AntiGuessingEvent.countDocuments({ user: user._id });
      let notified = false; let duplicate = false; let messageId: string | undefined;
      if(totalEvents % 3 === 0){
        const seq = totalEvents / 3;
        const subjectPrefix = `Hinweis: Häufiges Raten (#${seq}) bei ${user.username}`;
        const existing = await Message.findOne({ sender: user._id, recipientUser: cls.teacher, subject: subjectPrefix }, '_id');
        if(!existing){
          const body = `Automatische Meldung (Anti-Raten-Schutz) Testlauf:\nUser ${user.username} hat jetzt ${totalEvents} Events. Meldung #${seq}.`;
          const msg = await Message.create({ sender: user._id, recipientUser: cls.teacher, subject: subjectPrefix, body });
          notified = true; messageId = String(msg._id);
        } else {
          duplicate = true;
        }
      }
      steps.push({ step:i, totalEvents, notified, duplicate, messageId });
    }

    const finalEvents = await AntiGuessingEvent.countDocuments({ user: user._id });
    const allMsgs = await Message.find({ sender: user._id, recipientUser: cls.teacher, subject: /Häufiges Raten/ }, 'subject createdAt').sort({ createdAt:1 });

    return NextResponse.json({ success:true, username, preCount, steps, finalEvents, messages: allMsgs });
  } catch(e:any){
    return NextResponse.json({ success:false, error: e?.message || 'Serverfehler' }, { status:500 });
  }
}
