import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import User from "@/models/User";
import Lesson from "@/models/Lesson";
import AuditLog from "@/models/AuditLog";

export async function POST(req: Request) {
  await dbConnect();
  const { username, lessonId, courseId, earnedStar: clientEarnedStar, questionStats } = await req.json();

  if (!username || !lessonId) {
    return NextResponse.json({ error: "Username und LessonId erforderlich." }, { status: 400 });
  }

  const user = await User.findOne({ username });
  if (!user) {
    return NextResponse.json({ error: "Nutzer nicht gefunden." }, { status: 404 });
  }

  // Normalisiertes Ziel-Format: nur lessonId speichern
  const keyNew = String(lessonId);
  // Alte Form ggf. noch vorhanden
  const legacyKey = courseId ? `${courseId}-${lessonId}` : undefined;
  const alreadyCompleted = user.completedLessons.includes(keyNew) || (legacyKey ? user.completedLessons.includes(legacyKey) : false);
  if (!alreadyCompleted) {
    user.completedLessons.push(keyNew);
  } else if (legacyKey && user.completedLessons.includes(legacyKey) && !user.completedLessons.includes(keyNew)) {
    // Migration: legacy durch neues Format ersetzen
    user.completedLessons = user.completedLessons.filter(k => k !== legacyKey);
    user.completedLessons.push(keyNew);
  }

  // Lesson laden (Typ nötig für server-seitige Sternentscheidung)
  let lesson: { _id: any; type?: string } | null = null;
  try {
    lesson = await Lesson.findById(lessonId).select('_id type').lean();
  } catch {
    // ignorieren – wenn nicht gefunden, kein Stern
  }

  // Server-seitige Policy: Welche Typen dürfen Sterne liefern?
  // Ausnahmen (kein Stern): 'markdown' = reiner Informationstext, 'text' (falls als Info genutzt)
  const STAR_TYPES = new Set([
    'single-choice',
    'multiple-choice',
    'matching',
    'memory',
    'lueckentext',
    'ordering',
    'text-answer',
    'video',
  'minigame',
  'snake'
  ]);

  // Entscheidung unabhängig vom Client-Flag (clientEarnedStar nur fürs Audit protokolliert)
  let starGranted = false;
  const eligible = !alreadyCompleted && lesson && lesson.type && STAR_TYPES.has(lesson.type);
  if (eligible) {
    if (!user.stars) user.stars = 0;
    user.stars += 1;
    starGranted = true;
  }

  // Frage-Statistik aktualisieren (first try Quote)
  try {
    if (Array.isArray(questionStats) && questionStats.length) {
      // Erwartetes Format: [{ firstTryCorrect: number, total: number }]
      const agg = questionStats.reduce((acc: { firstTryCorrect: number; total: number }, q: any) => {
        const ft = Number(q.firstTryCorrect || 0); const tot = Number(q.total || 0);
        if (tot > 0 && ft >= 0) { acc.firstTryCorrect += ft; acc.total += tot; }
        return acc;
      }, { firstTryCorrect: 0, total: 0 });
      if (agg.total > 0) {
        // Pro Lektion Eintrag aktualisieren / anlegen
        if (!Array.isArray((user as any).lessonStats)) (user as any).lessonStats = [];
        const ls: any[] = (user as any).lessonStats;
        const existing = ls.find(l => l.lessonId === String(lessonId));
        if (existing) { existing.firstTryCorrect = agg.firstTryCorrect; existing.total = agg.total; }
        else { ls.push({ lessonId: String(lessonId), firstTryCorrect: agg.firstTryCorrect, total: agg.total }); }
        // Gesamt aggregieren
        const totals = ls.reduce((a, l) => { a.first += (l.firstTryCorrect||0); a.total += (l.total||0); return a; }, { first:0, total:0 });
        (user as any).firstTryCorrectTotal = totals.first;
        (user as any).totalQuestionsTotal = totals.total;
      }
    }
  } catch(e) { console.warn('questionStats update failed', e); }

  await user.save();

  // Audit protokollieren (Fehler ignorieren, um Completion nicht zu blockieren)
  try {
    await AuditLog.create({
      action: 'lesson.complete',
      user: username,
      targetType: 'lesson',
      targetId: String(lessonId),
      courseId: courseId ? String(courseId) : undefined,
  meta: { clientEarnedStar: !!clientEarnedStar, computedEligible: !!eligible, granted: starGranted, lessonType: lesson?.type }
    });
  } catch (e) { console.warn('AuditLog lesson.complete fehlgeschlagen', e); }

  return NextResponse.json({
    message: "Lektion abgeschlossen!",
    earnedStar: starGranted,
    totalStars: user.stars || 0,
    alreadyCompleted,
    firstTry: {
      aggregated: { firstTryCorrect: user.firstTryCorrectTotal || 0, total: user.totalQuestionsTotal || 0 },
      lesson: (user as any).lessonStats?.find((l: any) => l.lessonId === String(lessonId)) || null
    }
  });
}
