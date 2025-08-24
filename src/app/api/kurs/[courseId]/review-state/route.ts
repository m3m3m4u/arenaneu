import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import dbConnect from '@/lib/db';
import Course from '@/models/Course';

export async function GET(
  _req: Request,
  context: { params: Promise<{ courseId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if(!session?.user) return NextResponse.json({ success:false, error:'Nicht authentifiziert' }, { status:401 });
    const role = (session.user as any).role;
    const username = (session.user as any).username;
    await dbConnect();
    const { courseId } = await context.params;
    const course = await Course.findById(courseId).lean();
    if(!course) return NextResponse.json({ success:false, error:'Kurs nicht gefunden' }, { status:404 });
    // Nur eigener Teacher-Kurs oder author/admin dürfen Status sehen
    const isOwnerTeacher = role==='teacher' && String((course as any).author) === username;
    if(!(isOwnerTeacher || role==='admin' || role==='author')) return NextResponse.json({ success:false, error:'Keine Berechtigung' }, { status:403 });
    const pendingCopy = await Course.findOne({ originalCourseId: courseId, reviewStatus:'pending' }).select('_id').lean();
    const approved = !!course.isPublished && course.reviewStatus==='approved';
    const pending = !!pendingCopy;
    return NextResponse.json({ success:true, pending, approved });
  } catch (e:any) {
    console.error('review-state error', e);
    return NextResponse.json({ success:false, error:'Fehler beim Laden', message:e?.message }, { status:500 });
  }
}