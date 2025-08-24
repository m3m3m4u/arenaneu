import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import dbConnect from '@/lib/db';
import Course from '@/models/Course';
import Lesson from '@/models/Lesson';

// Teacher sendet Kurs zur Prüfung: es wird eine schreibgeschützte Kopie erstellt (reviewStatus=pending)
// Original bleibt unverändert für Lehrer & dessen Klassen verfügbar.
export async function POST(
  _req: Request,
  context: { params: Promise<{ courseId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if(!session?.user) return NextResponse.json({ success:false, error:'Nicht authentifiziert' }, { status:401 });
    const role = (session.user as any).role;
    const username = (session.user as any).username;
    if(role !== 'teacher') return NextResponse.json({ success:false, error:'Nur Lehrer können Kurs einreichen' }, { status:403 });
    await dbConnect();
    const { courseId } = await context.params;
    const original = await Course.findById(courseId).lean();
    if(!original) return NextResponse.json({ success:false, error:'Originalkurs nicht gefunden' }, { status:404 });
    if(String((original as any).author) !== username) return NextResponse.json({ success:false, error:'Nur eigener Kurs einreichbar' }, { status:403 });
    // Prüfen ob bereits eine pending Kopie existiert
    const existingPending = await Course.findOne({ originalCourseId: courseId, reviewStatus:'pending' }).lean();
    if(existingPending) return NextResponse.json({ success:true, copyId: String(existingPending._id), already:true });

    // Neue Kopie anlegen
    const copy = await Course.create({
      title: original.title,
      description: original.description,
      category: original.category,
      tags: original.tags || [],
      author: username, // bleibt gleich
      lessons: [], // füllen wir gleich
      isPublished: false,
      reviewStatus: 'pending',
      originalCourseId: String(original._id),
      progressionMode: original.progressionMode || 'free'
    });
    const origLessons = await Lesson.find({ courseId }).lean();
    for(const l of origLessons){
      await Lesson.create({
        title: l.title,
        courseId: String(copy._id),
        category: l.category,
        type: l.type,
        questions: l.questions || [],
        content: l.content || {},
        isExercise: l.isExercise || false,
        order: l.order || 0
      });
    }
    return NextResponse.json({ success:true, copyId: String(copy._id) });
  } catch (e:any) {
    console.error('submit-review error', e);
    return NextResponse.json({ success:false, error:'Fehler beim Einreichen', message: e?.message }, { status:500 });
  }
}