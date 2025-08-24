import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import dbConnect from '@/lib/db';
import Course from '@/models/Course';
import Lesson from '@/models/Lesson';

export async function GET(){
  try { await dbConnect(); } catch(e:any){ return NextResponse.json({ success:false, error:'DB-Verbindung fehlgeschlagen', message:String(e?.message||e) }, { status:500 }); }
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if(role!=='admin') return NextResponse.json({ success:false, error:'Unauthorized' }, { status:403 });
  const pending = await Course.find({ reviewStatus:'pending' }).sort({ updatedAt:-1 }).select('_id title description author category createdAt updatedAt reviewStatus isPublished').lean();
  const rejected = await Course.find({ reviewStatus:'rejected' }).sort({ updatedAt:-1 }).limit(20).select('_id title description author category createdAt updatedAt reviewStatus isPublished').lean();
  return NextResponse.json({ success:true, pending: pending.map(c=>({ ...c, _id:String(c._id) })), rejected: rejected.map(c=>({ ...c, _id:String(c._id) })) });
}

export async function POST(req:Request){
  try { await dbConnect(); } catch(e:any){ return NextResponse.json({ success:false, error:'DB-Verbindung fehlgeschlagen', message:String(e?.message||e) }, { status:500 }); }
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if(role!=='admin') return NextResponse.json({ success:false, error:'Unauthorized' }, { status:403 });
  const body = await req.json().catch(()=>({}));
  const { action, courseId } = body || {};
  if(!courseId) return NextResponse.json({ success:false, error:'courseId fehlt' }, { status:400 });
  if(action==='approve'){
    const copy = await Course.findById(courseId);
    if(!copy) return NextResponse.json({ success:false, error:'Kurs nicht gefunden' }, { status:404 });
    // Wenn Kopie einer Original-ID
    if(copy.originalCourseId){
      const original = await Course.findById(copy.originalCourseId);
      if(original){
        // Original updaten mit Daten der Kopie
        original.title = copy.title;
        original.description = copy.description;
        original.category = copy.category;
        original.tags = copy.tags as any;
        original.progressionMode = copy.progressionMode as any;
        original.isPublished = true;
        original.reviewStatus = 'approved';
        await original.save();
        // Lektionen ersetzen: alte löschen, neue kopieren
        await Lesson.deleteMany({ courseId: original._id });
        const copyLessons = await Lesson.find({ courseId: copy._id }).lean();
        for(const l of copyLessons){
          await Lesson.create({
            title: l.title,
            courseId: String(original._id),
            category: l.category,
            type: l.type,
            questions: l.questions || [],
            content: l.content || {},
            isExercise: l.isExercise || false,
            order: l.order || 0
          });
        }
      }
      // Kopie kann bleiben (Historie) oder gelöscht werden – wir löschen um Verwirrung zu vermeiden
      await Course.findByIdAndDelete(copy._id);
      return NextResponse.json({ success:true, courseId: copy.originalCourseId, status:'approved', merged:true });
    } else {
      copy.isPublished = true;
      copy.reviewStatus = 'approved';
      await copy.save();
      return NextResponse.json({ success:true, courseId: String(copy._id), status:'approved' });
    }
  }
  if(action==='reject'){
    const updated = await Course.findByIdAndUpdate(courseId, { reviewStatus:'rejected', isPublished:false, updatedAt:new Date() }, { new:true });
    if(!updated) return NextResponse.json({ success:false, error:'Kurs nicht gefunden' }, { status:404 });
    return NextResponse.json({ success:true, courseId: String(updated._id), status:'rejected' });
  }
  return NextResponse.json({ success:false, error:'Unbekannte Aktion' }, { status:400 });
}
