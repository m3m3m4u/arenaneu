import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Course from "@/models/Course";
import Lesson from "@/models/Lesson"; // hinzugefügt
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import User from '@/models/User';
import ClassCourseAccess from '@/models/ClassCourseAccess';
import { CATEGORIES as ALLOWED_CATEGORIES, normalizeCategory } from '@/lib/categories';

type LeanCourse = { _id: unknown } & Record<string, unknown>;

type CountAgg = { _id: string; count: number };

// Einfacher In-Memory Cache (pro Lambda/Runtime). Nur für non-learner Rollen.
type CacheEntry = { expires: number; json: any };
const globalAny = global as any;
if (!globalAny.__COURSE_LIST_CACHE__) globalAny.__COURSE_LIST_CACHE__ = new Map<string, CacheEntry>();
const COURSE_CACHE: Map<string, CacheEntry> = globalAny.__COURSE_LIST_CACHE__;

export async function GET(req: any) {
  try {
    await dbConnect();
    const session = await getServerSession(authOptions);
    const url = new URL(req.url);
    const showAll = url.searchParams.get('showAll') === '1';
    const requestedMode = (url.searchParams.get('mode') || '').toLowerCase() === 'all' ? 'all' : 'class';
    const rawCat = url.searchParams.get('cat');
    const searchQ = (url.searchParams.get('q') || '').trim().toLowerCase();
    const statusFilter = (url.searchParams.get('status') || '').toLowerCase(); // 'pub' | 'draft'
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '10', 10)));

  const normalizedCat = (() => {
      if (!rawCat) return undefined;
      const v = String(rawCat).trim();
      if (!v || /^(alle|all|any)$/i.test(v)) return undefined;
      return normalizeCategory(v);
    })();

    // Grundfilter (Autoren/Admin: optional unveröffentlichte)
    const baseFilter: Record<string, unknown> = {};
    if (!showAll) baseFilter.isPublished = true;
    if (normalizedCat) baseFilter.category = normalizedCat;
    if (statusFilter === 'pub') baseFilter.isPublished = true;
    if (statusFilter === 'draft') baseFilter.isPublished = false;
    if (searchQ) baseFilter.$or = [
      { title: { $regex: searchQ, $options: 'i' } },
      { description: { $regex: searchQ, $options: 'i' } }
    ];

    let courses: LeanCourse[] = [];
    let learnerScope: 'class' | 'all' | undefined;
    let activeMode: 'class' | 'all' | undefined;
    const role = (session?.user as any)?.role as string | undefined;
    const username = (session?.user as any)?.username as string | undefined;

    // Cache nur für nicht-learner anwenden (Autoren/Admin/Teacher), da Lernende ggf. individuelle Sicht haben
    const cacheTtlMs = parseInt(process.env.COURSE_LIST_CACHE_MS || '30000', 10);
    const allowCache = role !== 'learner' && cacheTtlMs > 0 && !url.searchParams.get('nocache');
    const cacheKey = allowCache ? JSON.stringify({ baseFilter, page, limit, searchQ, statusFilter, normalizedCat }) : '';
    if (allowCache) {
      const hit = COURSE_CACHE.get(cacheKey);
      if (hit && hit.expires > Date.now()) {
        return NextResponse.json({ ...hit.json, cached: true });
      }
    }

    if (role === 'learner' && username) {
      const me = await User.findOne({ username }, '_id class').lean();
      const classId = me?.class ? String(me.class) : null;
      if (classId) {
        const TeacherClass = (await import('@/models/TeacherClass')).default;
        const cls = await TeacherClass.findById(classId).select('courseAccess').lean();
        const allowed = (cls as any)?.courseAccess === 'all' ? 'all' : 'class';
        learnerScope = allowed;
        const effective = allowed === 'all' && requestedMode === 'all' ? 'all' : 'class';
        activeMode = effective;
        if (effective === 'class') {
          const accesses = await ClassCourseAccess.find({ class: classId }).lean();
          const allowedCourseIds = accesses.map(a => String(a.course));
          if (allowedCourseIds.length === 0) {
            courses = [];
          } else {
            const f: Record<string, unknown> = { ...baseFilter, _id: { $in: allowedCourseIds } };
            const totalCount = await Course.countDocuments(f);
            courses = await Course.find(f).sort({ createdAt: -1 }).skip((page-1)*limit).limit(limit).lean();
            const withMeta = await attachLessonCounts(courses);
            let categories: string[] | undefined;
            if (page === 1) {
              // Alle Kategorien unabhängig vom gesetzten Kategorie-Filter laden
              const catFilter: Record<string, unknown> = { _id: { $in: allowedCourseIds } };
              if (typeof baseFilter.isPublished !== 'undefined') catFilter.isPublished = baseFilter.isPublished;
              // KEIN catFilter.category, damit vollständige Liste erhalten bleibt
              if (Array.isArray((baseFilter as any).$or)) (catFilter as any).$or = (baseFilter as any).$or;
              categories = await Course.distinct('category', catFilter as any);
            }
            return NextResponse.json({ success: true, courses: withMeta, learnerScope, activeMode, page, pageSize: limit, totalCount, categories });
          }
        } else {
          const totalCount = await Course.countDocuments(baseFilter);
          courses = await Course.find(baseFilter).sort({ createdAt: -1 }).skip((page-1)*limit).limit(limit).lean();
          const withMeta = await attachLessonCounts(courses);
          let categories: string[] | undefined;
          if (page === 1) {
            // Kategorien ohne category-Constraint ermitteln
            const categoryFilterAll: Record<string, unknown> = {};
            if (typeof baseFilter.isPublished !== 'undefined') categoryFilterAll.isPublished = baseFilter.isPublished;
            if (Array.isArray((baseFilter as any).$or)) (categoryFilterAll as any).$or = (baseFilter as any).$or;
            categories = await Course.distinct('category', categoryFilterAll as any);
          }
          return NextResponse.json({ success: true, courses: withMeta, learnerScope, activeMode, page, pageSize: limit, totalCount, categories });
        }
      } else {
        courses = [];
        return NextResponse.json({ success: true, courses: [], learnerScope: 'class', activeMode: 'class', page, pageSize: limit, totalCount: 0, categories: [] });
      }
    } else {
      const totalCount = await Course.countDocuments(baseFilter);
      courses = await Course.find(baseFilter).sort({ createdAt: -1 }).skip((page-1)*limit).limit(limit).lean();
      const withMeta = await attachLessonCounts(courses);
      let categories: string[] | undefined;
      if (page === 1) {
        // Kategorien unabhängig vom aktiven Kategorie-Filter (falls vorhanden) bestimmen
        const categoryFilterAll: Record<string, unknown> = {};
        if (typeof baseFilter.isPublished !== 'undefined') categoryFilterAll.isPublished = baseFilter.isPublished;
        if (Array.isArray((baseFilter as any).$or)) (categoryFilterAll as any).$or = (baseFilter as any).$or;
        categories = await Course.distinct('category', categoryFilterAll as any);
      }
      const payload = { success: true, courses: withMeta, page, pageSize: limit, totalCount, categories };
      if (allowCache) {
        COURSE_CACHE.set(cacheKey, { expires: Date.now() + cacheTtlMs, json: payload });
      }
      return NextResponse.json(payload);
    }
  } catch (error: unknown) {
    console.error('Fehler beim Laden der Kurse:', error);
    return NextResponse.json({ success: false, error: 'Fehler beim Laden der Kurse' }, { status: 500 });
  }
}

async function attachLessonCounts(courses: LeanCourse[]) {
  const courseIds = courses.map(c=> String(c._id));
  if (!courseIds.length) return courses.map(c=> ({...c, lessonCount: 0 }));
  const counts = await Lesson.aggregate<CountAgg>([
    { $match: { courseId: { $in: courseIds } } },
    { $group: { _id: '$courseId', count: { $sum: 1 } } }
  ]);
  const map: Record<string, number> = {};
  counts.forEach(c=>{ map[c._id] = c.count; });
  return courses.map(c=> ({ ...c, lessonCount: map[String(c._id)] || 0 }));
}

interface PostBody {
  title: unknown;
  description: unknown;
  category: unknown;
  tags?: unknown;
  author?: unknown;
  progressionMode?: unknown; // 'linear' | 'free'
}

export async function POST(req: any) {
  try {
    await dbConnect();
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role as string | undefined;
    if (!session?.user || (role !== 'author' && role !== 'admin')) {
      return NextResponse.json({ success: false, error: 'Keine Berechtigung' }, { status: 403 });
    }
    const raw = await req.json();
    const body = raw as PostBody;
  const { title, description, category, tags = [], author: authorFromBody, progressionMode } = body;

    if (!title || !description || !category) {
      return NextResponse.json({ success: false, error: 'Titel, Beschreibung und Kategorie sind erforderlich' }, { status: 400 });
    }

    const catStr = String(category).trim();
    const normalizedCategory = ALLOWED_CATEGORIES.find(c => c.toLowerCase() === catStr.toLowerCase()) || 'sonstiges';

  // Autor kommt aus Session – keine freie Wahl per Body
  const author = (session.user as any).username || 'author';
    const tagsArray: string[] = Array.isArray(tags) ? (tags as unknown[]).map((t) => String(t)) : [];

    const mode = progressionMode === 'linear' ? 'linear' : 'free';
    const newCourse = await Course.create({
      title: String(title).trim(),
      description: String(description).trim(),
      category: normalizedCategory,
      tags: tagsArray,
      author,
      lessons: [],
      isPublished: false,
      progressionMode: mode
    });

    return NextResponse.json({ success: true, courseId: String(newCourse._id), course: newCourse });
  } catch (error: unknown) {
    console.error('Fehler beim Erstellen des Kurses:', error);
    const dev = process.env.NODE_ENV !== 'production';
    const err = error as { name?: string; message?: string; errors?: unknown } | undefined;
    if (err?.name === 'ValidationError') {
      return NextResponse.json({ success: false, error: 'Validierungsfehler', fields: err.errors, message: dev ? err.message : undefined }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: 'Fehler beim Erstellen des Kurses', message: dev ? String(err?.message || error) : undefined }, { status: 500 });
  }
}
