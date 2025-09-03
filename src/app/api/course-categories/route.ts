import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Course from '@/models/Course';

export const runtime = 'nodejs';

// Liefert veröffentlichte Kurs-Kategorien (distinct, alphabetisch)
export async function GET(){
  try {
    await dbConnect();
    const cats: string[] = await Course.distinct('category', { isPublished: true });
    const sorted = cats.filter(Boolean).map(c=>String(c)).sort((a,b)=> a.localeCompare(b,'de',{sensitivity:'base'}));
    return NextResponse.json({ success:true, categories: sorted });
  } catch(e){
    return NextResponse.json({ success:false, error:'Fehler Kategorien' }, { status:500 });
  }
}