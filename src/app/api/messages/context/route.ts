import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import dbConnect from '@/lib/db';
import User from '@/models/User';
import TeacherClass from '@/models/TeacherClass';

// Liefert für Admin (oder Teacher fallback) eine kompakte Liste möglicher Ziele
export async function GET(){
  try { await dbConnect(); } catch(e:any){ return NextResponse.json({ success:false, error:'DB '+(e?.message||e) }, { status:500 }); }
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  const meId = (session?.user as any)?.id;
  if(!meId) return NextResponse.json({ success:false, error:'Unauthorized' }, { status:401 });

  if(role==='admin'){
    const learners = await User.find({ role:'learner' }, '_id username name ownerTeacher').limit(1000).lean();
    const teachers = await User.find({ role:'teacher' }, '_id username name').limit(500).lean();
    const classes = await TeacherClass.find({}, '_id name teacher').limit(1000).lean();
    return NextResponse.json({ success:true, learners, teachers, classes });
  }
  if(role==='teacher'){
    // Fallback (für UI Konsistenz)
    const learners = await User.find({ ownerTeacher: meId }, '_id username name').lean();
    const classes = await TeacherClass.find({ teacher: meId }, '_id name').lean();
    return NextResponse.json({ success:true, learners, teachers:[], classes });
  }
  return NextResponse.json({ success:false, error:'Unauthorized' }, { status:403 });
}
