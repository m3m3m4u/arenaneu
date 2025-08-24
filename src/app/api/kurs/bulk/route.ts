import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import dbConnect from '@/lib/db';
import Course from '@/models/Course';

// Einfacher In-Memory Cache pro Runtime
interface CacheEntry { data: any; expires: number; }
const CACHE_TTL_MS = 30_000; // 30s reicht hier
const bulkCourseCache = new Map<string, CacheEntry>();

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role as string | undefined;
    if (!session?.user || !(role === 'author' || role === 'admin' || role === 'teacher')) {
      return NextResponse.json({ success: false, error: 'Nicht berechtigt' }, { status: 403 });
    }

    await dbConnect();
    const url = new URL(request.url);
    const idsParam = url.searchParams.get('ids') || '';
    if (!idsParam.trim()) {
      return NextResponse.json({ success: true, courses: [] });
    }
    // IDs säubern & begrenzen (Schutz gegen riesige Listen)
    const ids = Array.from(new Set(idsParam.split(',').map(s => s.trim()).filter(Boolean))).slice(0, 200);
    if (!ids.length) {
      return NextResponse.json({ success: true, courses: [] });
    }
    const cacheKey = ids.slice().sort().join(',');
    const now = Date.now();
    const cached = bulkCourseCache.get(cacheKey);
    if (cached && cached.expires > now) {
      return NextResponse.json({ success: true, courses: cached.data, cached: true });
    }

    const courses = await Course.find({ _id: { $in: ids } })
      .select('_id title isPublished category')
      .lean();
    const minimal = courses.map(c => ({ id: String(c._id), title: c.title, isPublished: c.isPublished, category: c.category }));
    bulkCourseCache.set(cacheKey, { data: minimal, expires: now + CACHE_TTL_MS });
    return NextResponse.json({ success: true, courses: minimal, cached: false });
  } catch (err) {
    console.error('Fehler bulk Kurse:', err);
    return NextResponse.json({ success: false, error: 'Fehler beim Laden' }, { status: 500 });
  }
}
