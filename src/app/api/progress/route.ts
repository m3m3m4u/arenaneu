import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import User from '@/models/User';
import { recordRequest } from '@/lib/requestMetrics';

// In-Memory Cache für GET Progress (username) und Dedupe Map für POSTs
type ProgressGetCacheEntry = { expires: number; payload: any; };
const g: any = global;
if(!g.__PROGRESS_GET_CACHE__) g.__PROGRESS_GET_CACHE__ = new Map<string, ProgressGetCacheEntry>();
if(!g.__PROGRESS_POST_DEDUPE__) g.__PROGRESS_POST_DEDUPE__ = new Map<string, number>(); // key=username|lessonId -> lastTs
const PROGRESS_GET_CACHE: Map<string, ProgressGetCacheEntry> = g.__PROGRESS_GET_CACHE__;
const PROGRESS_POST_DEDUPE: Map<string, number> = g.__PROGRESS_POST_DEDUPE__;

// Erwartet { username } und liefert completedLessons Array
export async function GET(req: Request) {
  recordRequest('/api/progress','GET');
  try {
    const url = new URL(req.url);
    const username = url.searchParams.get('username');
    if (!username) return NextResponse.json({ success: false, error: 'username fehlt' }, { status: 400 });
    const cacheTtl = parseInt(process.env.PROGRESS_GET_CACHE_MS || '10000', 10);
    const allowCache = cacheTtl > 0 && !url.searchParams.get('nocache');
    if (allowCache){
      const hit = PROGRESS_GET_CACHE.get(username);
      if (hit && hit.expires > Date.now()){
        return NextResponse.json(hit.payload, { headers: { 'Cache-Control': 'private, max-age=10' } });
      }
    }
    await dbConnect();
    const users = await User.find({ username }).lean();
    const user = Array.isArray(users) ? users[0] : (users as unknown);
    if (!user) return NextResponse.json({ success: false, error: 'User nicht gefunden' }, { status: 404 });
    const rawCompleted = (user as { completedLessons?: string[] } | null)?.completedLessons || [];
    const normalizedSet = new Set<string>();
    let legacyCount = 0;
    for (const entry of rawCompleted) {
      if (!entry || typeof entry !== 'string') continue;
      if (normalizedSet.has(entry)) continue;
      if (entry.includes('-')) {
        const parts = entry.split('-');
        const last = parts[parts.length - 1];
        if (last && !normalizedSet.has(last)) {
          normalizedSet.add(last);
          legacyCount++;
        }
      } else {
        normalizedSet.add(entry);
      }
    }
    const completed = Array.from(normalizedSet);
    // Keine Schreiboperation in GET, reine Darstellung; Migration erfolgt bei POST oder Admin-Endpunkt
    const payload = { success: true, completedLessons: completed, legacyConvertedVirtual: legacyCount };
    if (allowCache){
      PROGRESS_GET_CACHE.set(username, { expires: Date.now()+cacheTtl, payload });
    }
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'private, max-age=10' } });
  } catch (e: unknown) {
    const err = e as { message?: string } | undefined;
    return NextResponse.json({ success: false, error: 'Fehler beim Laden des Fortschritts', details: err?.message }, { status: 500 });
  }
}

// POST { username, lessonId } fügt eine Lesson zu completedLessons hinzu (idempotent)
export async function POST(req: Request) {
  recordRequest('/api/progress','POST');
  try {
    const body = await req.json();
    const { username, lessonId } = body as { username?: unknown; lessonId?: unknown };
    if (!username || !lessonId) return NextResponse.json({ success: false, error: 'username und lessonId erforderlich' }, { status: 400 });
    const dedupeMs = parseInt(process.env.PROGRESS_POST_DEDUPE_MS || '5000', 10);
    const key = `${username}|${lessonId}`;
    const now = Date.now();
    const last = PROGRESS_POST_DEDUPE.get(key) || 0;
    if (dedupeMs > 0 && (now - last) < dedupeMs){
      // Kurz hintereinander – überspringen, meldet trotzdem Erfolg (idempotent)
      return NextResponse.json({ success: true, deduped: true });
    }
    PROGRESS_POST_DEDUPE.set(key, now);
    await dbConnect();
    const userDoc = await User.findOne({ username: String(username) });
    if (!userDoc) return NextResponse.json({ success: false, error: 'User nicht gefunden' }, { status: 404 });
    if (!Array.isArray(userDoc.completedLessons)) {
      userDoc.completedLessons = [];
    }
    const lessonIdStr = String(lessonId);
    // Entferne Legacy-Einträge (courseId-lessonId) für dasselbe lessonId
    userDoc.completedLessons = userDoc.completedLessons.filter(k => {
      if (k === lessonIdStr) return true;
      if (k.includes('-')) {
        const last = k.split('-').pop();
        return last !== lessonIdStr; // behalten nur wenn nicht gleiche lessonId
      }
      return k !== lessonIdStr; // doppelte reine IDs entfernen
    });
    if (!userDoc.completedLessons.includes(lessonIdStr)) {
      userDoc.completedLessons.push(lessonIdStr);
    }
    let changed = false;
    if (!userDoc.completedLessons.includes(lessonIdStr)) {
      userDoc.completedLessons.push(lessonIdStr);
      changed = true;
    }
    if (changed){
      await userDoc.save();
      // Invalidate GET Cache für diesen User
      PROGRESS_GET_CACHE.delete(String(username));
    }
    return NextResponse.json({ success: true, completedLessons: userDoc.completedLessons, updated: changed });
  } catch (e: unknown) {
    const err = e as { message?: string } | undefined;
    return NextResponse.json({ success: false, error: 'Fehler beim Speichern des Fortschritts', details: err?.message }, { status: 500 });
  }
}
