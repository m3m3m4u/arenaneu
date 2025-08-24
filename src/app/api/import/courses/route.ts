import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import dbConnect from '@/lib/db';
import Course from '@/models/Course';
import Lesson from '@/models/Lesson';
import * as XLSX from 'xlsx';
import { normalizeCategory } from '@/lib/categories';

type ParsedLesson = {
  type: string;
  title: string;
  raw: string;
  content?: any;
  questions?: any[];
  errors: string[];
};
type ParsedCourse = {
  title: string;
  category: string;
  description: string;
  lessons: ParsedLesson[];
  errors: string[];
};

interface ParseResult {
  courses: ParsedCourse[];
  errors: string[];
}

function parseWorkbook(buf: Buffer): ParseResult {
  const errors: string[] = [];
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { courses: [], errors: ['Keine Tabelle gefunden'] };
  const ws = wb.Sheets[sheetName];
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const courses: ParsedCourse[] = [];
  const typeRegex = /^(VIDEO|VID|MD|MARKDOWN|MC|MULTI|SC|SINGLE|MATCHING|ZUORDNUNG|PAARE|MEMORY|MEM|ORDER|ORDERING|LUECKENTEXT|GAP|TEXT-ANSWER|TEXTANSWER|TEXT|MINIGAME|GAME)\s*:?$/i;

  for (let c = range.s.c; c <= range.e.c; c++) {
    const rowTitle = range.s.r;
    const rowCategory = range.s.r + 1;
  const rowDescription = range.s.r + 2; // Beschreibung (optional)
    const titleCell = ws[XLSX.utils.encode_cell({ r: rowTitle, c })];
    const catCell = ws[XLSX.utils.encode_cell({ r: rowCategory, c })];
    const descCell = ws[XLSX.utils.encode_cell({ r: rowDescription, c })];
    const courseTitle = (titleCell?.v || '').toString().trim();
    if (!courseTitle) continue; // Spalte ohne Titel ignorieren
    const rawCat = (catCell?.v || '').toString().trim();
    const category = normalizeCategory(rawCat) || 'sonstiges';
  let description = (descCell?.v || '').toString().trim();
    const courseErrors: string[] = [];
    const lessons: ParsedLesson[] = [];

    // Fallback: Wenn beschreibungs-Zelle bereits eine Typ-Zeile ist (legacy Sheet ohne eigene Beschreibungszeile), Beschreibung leer setzen und ab dieser Zeile lesen
    const typeRegex = /^(VIDEO|VID|MD|MARKDOWN|MC|MULTI|SC|SINGLE|MATCHING|ZUORDNUNG|PAARE|MEMORY|MEM|ORDER|ORDERING|LUECKENTEXT|GAP|TEXT-ANSWER|TEXTANSWER|TEXT|MINIGAME|GAME)\s*:?$/i;
    let firstLessonRow = range.s.r + 3; // Standard: nach Beschreibung
    if (description && typeRegex.test(description)) {
      // Beschreibung war eigentlich schon eine Lektion
      firstLessonRow = rowDescription; // beginne bei der beschriebenen Zeile
      description = '';
    }
    const lines: string[] = [];
    for (let r = firstLessonRow; r <= range.e.r; r++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      const v = cell?.v;
      const line = (v === undefined || v === null) ? '' : v.toString().trimEnd();
      lines.push(line);
    }
    // Entscheide ob altes Multi-Line-in-Zelle Format (erkennbar an vorhandenen \n in irgendeiner Zelle) genutzt wurde
    const hasMultiLineCells = lines.some(l => /\n/.test(l));
    if (hasMultiLineCells) {
      // Fallback: jede nicht-leere Zelle = Lesson-Block wie zuvor
      for (const cellRaw of lines) {
        const trimmed = cellRaw.trim();
        if (!trimmed) continue;
        lessons.push(parseLesson(trimmed));
      }
    } else {
      // Neues zeilenbasiertes Format: Sequenzen beginnen bei Typ-Zeile; blank lines trennen Lektionen nur wenn neue Typ-Zeile folgt.
      let current: string[] = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) {
          // Leere Zeile -> einfach hinzufügen (für SC/MC Blocktrennung); Abschluss nur bei doppeltem Typ später
          if (current.length) current.push('');
          continue;
        }
        if (typeRegex.test(line) && current.length) {
          // Neuer Typ startet neue Lesson -> vorherige flushen (Leerzeilen am Ende trimmen)
            while (current.length && current[current.length-1] === '') current.pop();
            lessons.push(parseLesson(current.join('\n')));
            current = [line];
        } else {
          current.push(line);
        }
      }
      if (current.length) {
        while (current.length && current[current.length-1] === '') current.pop();
        lessons.push(parseLesson(current.join('\n')));
      }
    }
  courses.push({ title: courseTitle, category, description, lessons, errors: courseErrors });
  }

  // Duplikate
  const seen = new Set<string>();
  for (const c of courses) {
    const k = c.title.toLowerCase();
    if (seen.has(k)) c.errors.push('Doppelter Kurstitel innerhalb der Datei'); else seen.add(k);
  }
  return { courses, errors };
}

function parseLesson(raw: string): ParsedLesson {
  const errors: string[] = [];
  const linesRaw = raw.split(/\r?\n/);
  if (!linesRaw.some(l=>l.trim().length>0)) return { type:'single-choice', title:'Leer', raw, errors:['Leere Zelle'] };
  // Trim only ends, keep empties for block splitting
  const lines = linesRaw.map(l=>l.trim());
  let type = 'single-choice';
  let idx = 0;
  const prefixRe = /^(VIDEO|VID|MD|MARKDOWN|MC|MULTI|SC|SINGLE|MATCHING|ZUORDNUNG|PAARE|MEMORY|MEM|ORDER|ORDERING|LUECKENTEXT|GAP|TEXT-ANSWER|TEXTANSWER|TEXT|MINIGAME|GAME)\s*:?$/i;
  if (lines[0] && prefixRe.test(lines[0])) {
    const p = lines[0].replace(/:$/,'').toUpperCase();
    idx = 1;
    switch(p){
      case 'VIDEO': case 'VID': type='video'; break;
      case 'MD': case 'MARKDOWN': type='markdown'; break;
      case 'MC': case 'MULTI': type='multiple-choice'; break;
      case 'SC': case 'SINGLE': type='single-choice'; break;
      case 'MATCHING': case 'ZUORDNUNG': case 'PAARE': type='matching'; break;
      case 'MEMORY': case 'MEM': type='memory'; break;
      case 'ORDER': case 'ORDERING': type='ordering'; break;
      case 'LUECKENTEXT': case 'GAP': type='lueckentext'; break;
      case 'TEXT-ANSWER': case 'TEXTANSWER': case 'TEXT': type='text-answer'; break;
      case 'MINIGAME': case 'GAME': type='minigame'; break;
    }
  }
  // Video
  if (type === 'video') {
    if (lines.length - idx < 2) return { type, title:'Video', raw, errors:['Erwarte Titel und URL'] };
    const title = lines[idx] || 'Video';
    const url = lines[idx+1] || '';
    if (!/^https?:\/\//.test(url)) errors.push('Ungültige URL');
    const markdownText = lines.slice(idx+2).join('\n').trim();
    return { type, title, raw, content:{ url, text: markdownText }, errors };
  }
  // Markdown
  if (type === 'markdown') {
    if (lines.length - idx === 1) return { type, title:'Markdown', raw, content:{ markdown: lines[idx] }, errors };
    const title = lines[idx] || 'Markdown';
    const md = lines.slice(idx+1).join('\n');
    return { type, title, raw, content:{ markdown: md }, errors };
  }
  // Matching / Memory (Paare, Leerzeilen erlauben)
  if (type === 'matching' || type === 'memory') {
    if (lines.length - idx < 2) return { type, title:'Zuordnung', raw, errors:['Keine Paare'] };
    const title = lines[idx] || 'Zuordnung';
    const afterHeader = lines.slice(idx+1);
    const pairs: { left:string; right:string }[] = [];
    const pairBlocks: { left:string; right:string }[][] = [];
    let currentBlock: { left:string; right:string }[] = [];
    for (const line of afterHeader) {
      if (!line) { // Blockende
        if (currentBlock.length) { pairBlocks.push(currentBlock); currentBlock = []; }
        continue;
      }
      const [left,right] = line.split('|').map(s=>s.trim());
      if (!left || !right) { errors.push('Ungültiges Paar: '+line); continue; }
      const pair = { left, right };
      pairs.push(pair);
      currentBlock.push(pair);
    }
    if (currentBlock.length) pairBlocks.push(currentBlock);
    if (!pairs.length) errors.push('Keine gültigen Paare');
    return { type, title, raw, content:{ pairs, pairBlocks }, errors };
  }
  // Ordering
  if (type === 'ordering') {
    if (lines.length - idx < 2) return { type, title:'Reihenfolge', raw, errors:['Keine Items'] };
    const title = lines[idx] || 'Reihenfolge';
    const items = lines.slice(idx+1).filter(l=>l);
    if (!items.length) errors.push('Keine Items');
    return { type, title, raw, content:{ items }, errors };
  }
  // Lückentext
  if (type === 'lueckentext') {
    if (lines.length - idx < 2) return { type, title:'Lückentext', raw, errors:['Kein Text'] };
    const title = lines[idx] || 'Lückentext';
    const text = lines.slice(idx+1).join('\n');
    // Erzeuge masked + strukturierte gaps
    let gapIndex = 0;
    const gapsRaw: { id:number; answer:string }[] = [];
    const masked = text.replace(/\*(.+?)\*/g, (_m, g1) => { gapIndex += 1; gapsRaw.push({ id: gapIndex, answer: String(g1).trim() }); return `___${gapIndex}___`; });
    if (!gapsRaw.length) errors.push('Keine *Antworten* gefunden');
    return { type, title, raw, content:{ markdownOriginal: text, markdownMasked: masked, gaps: gapsRaw, mode: 'drag' }, errors };
  }
  // Text-Antwort
  if (type === 'text-answer') {
    if (lines.length - idx < 2) return { type, title:'Text', raw, errors:['Kein Prompt'] };
    const title = lines[idx] || 'Text';
    const prompt = lines.slice(idx+1).join('\n');
    return { type, title, raw, content:{ prompt }, errors };
  }
  // Minigame (frei konfigurierbar): Titel + optionale Konfigurationszeilen
  if (type === 'minigame') {
    if (lines.length - idx < 1) return { type, title:'Minigame', raw, errors:['Kein Titel'] };
    const title = lines[idx] || 'Minigame';
    const configLinesAll = lines.slice(idx+1);
    // Behalte auch Leerzeilen zur Blockerkennung
    const trimmedLines = configLinesAll.map(l=>l.trimEnd());
    // Split in Frage-Blöcke: bevorzugt durch Leerzeile getrennt
    const questionBlocks: string[][] = [];
    let current: string[] = [];
    for (const l of trimmedLines) {
      if (!l.trim()) {
        if (current.length) { questionBlocks.push(current); current=[]; }
        continue;
      }
      current.push(l.trim());
    }
    if (current.length) questionBlocks.push(current);
    // Falls keine Leerzeilen genutzt wurden aber eine konstante Blockgröße vermutet werden kann (z.B. 5er Gruppen)
    if (questionBlocks.length===1 && questionBlocks[0].length>5) {
      const flat = questionBlocks[0];
      // Heuristik: gängige Blockgrößen 2..8 prüfen
      const candidateSizes = [5,4,6,3,7,8,2];
      for (const size of candidateSizes) {
        if (flat.length % size === 0) {
          const regroup: string[][] = [];
            for (let i=0;i<flat.length;i+=size) regroup.push(flat.slice(i,i+size));
          // Falls Ergebnis sinnvoll (>=2 Blöcke), übernehmen
          if (regroup.length >= 2) { questionBlocks.splice(0, questionBlocks.length, ...regroup); break; }
        }
      }
    }
    const configLines = trimmedLines.filter(l=>l.trim().length>0);
    const configText = configLines.join('\n');
    // einfache key=value Paare sammeln
    const config: Record<string,string> = {};
    for (const cl of configLines) {
      const m = cl.match(/^([^=:#]+)\s*[:=]\s*(.+)$/);
      if (m) config[m[1].trim()] = m[2].trim();
    }
    // Zusätzlich zu raw questionBlocks eine strukturierte blocks-Repräsentation erzeugen (erste Antwort als korrekt)
    const blocks = questionBlocks
      .map(block => {
        const arr = block.map(v=>String(v).trim()).filter(Boolean);
        if (arr.length < 2) return null; // mind. Frage + 1 Antwort
        const q = arr[0];
        const answers = arr.slice(1);
        return { question: q, answers, correct: 0 };
      })
      .filter(Boolean) as Array<{question:string; answers:string[]; correct:number}>;
    const content = { configLines, configText, config: Object.keys(config).length? config: undefined, questions: questionBlocks, blocks: blocks.length? blocks: undefined };
    return { type, title, raw, content, errors };
  }
  // SC/MC mit mehreren Fragenblöcken: Titel, dann Blöcke getrennt durch Leerzeile, jeder Block: Frage + Antworten
  if (lines.length - idx < 3) { // minimal: Titel + Frage + Antwort
    return { type:'single-choice', title: lines[idx]||'Frage', raw, errors:['Unvollständig (erwarte Titel, Frage, Antworten)'] };
  }
  const title = lines[idx];
  const qaLines = lines.slice(idx+1); // enthält Fragen / Antworten / Leerzeilen
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const l of qaLines) {
    if (!l.trim()) { if (current.length){ blocks.push(current); current=[]; } continue; }
    current.push(l);
  }
  if (current.length) blocks.push(current);
  const questions: any[] = [];
  let anyMulti = false;
  for (const b of blocks) {
    if (b.length < 2) { errors.push('Block ohne Antworten: '+(b[0]||'')); continue; }
    const q = b[0];
    const ansRaw = b.slice(1);
    const allAnswers: string[] = [];
    const correct: string[] = [];
    for (const a of ansRaw) {
      const isCorrect = /^\*/.test(a) || /\*$/.test(a);
      const cleaned = a.replace(/^\*/, '').replace(/\*$/, '').trim();
      if (!cleaned) continue;
      allAnswers.push(cleaned);
      if (isCorrect) correct.push(cleaned);
    }
    if (!allAnswers.length) { errors.push('Keine Antworten bei Frage: '+q); continue; }
    if (!correct.length) {
      // Single-Choice Standard: erste Antwort automatisch korrekt setzen (keine Fehlermeldung)
      if (ansRaw.length) {
        const first = allAnswers[0];
        correct.push(first);
      } else {
        errors.push('Keine richtige Antwort markiert bei Frage: '+q);
      }
    } else if (correct.length > 1) {
      // Heuristik:
      // - Wenn ALLE Antworten markiert wurden, interpretieren wir das als Bedienfehler und behalten nur die erste
      // - Wenn nur eine Teilmenge markiert ist, wird es Multiple-Choice (sofern nicht explizit SC erzwungen?)
      //   -> Upgrade zu MC nur, wenn nicht alle Antworten markiert sind ODER Typ bereits multiple-choice ist.
      if (correct.length === allAnswers.length && type !== 'multiple-choice') {
        const first = correct[0];
        correct.splice(0, correct.length, first); // nur erste behalten
        errors.push('Alle Antworten markiert; nur erste als korrekt übernommen (Single-Choice).');
      } else {
        anyMulti = true;
      }
    }
    questions.push({
      question: q,
      correctAnswer: correct.length===1 ? correct[0] : undefined,
      correctAnswers: correct.length>1 ? correct : undefined,
      wrongAnswers: allAnswers.filter(a=> !correct.includes(a)),
      allAnswers
    });
  }
  const finalType = anyMulti ? 'multiple-choice' : 'single-choice';
  return { type: finalType, title, raw, questions, errors };
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role as string | undefined;
    if (!session?.user || !['author','admin','teacher'].includes(String(role))) {
      return NextResponse.json({ success:false, error:'Keine Berechtigung' }, { status:403 });
    }
    await dbConnect();
    const form = await req.formData();
    const file = form.get('file');
    const mode = (form.get('mode') || 'preview').toString();
    if (!(file instanceof File)) {
      return NextResponse.json({ success:false, error:'Datei fehlt (file)' }, { status:400 });
    }
    const arrayBuffer = await file.arrayBuffer();
    const buf = Buffer.from(arrayBuffer);
    const parsed = parseWorkbook(buf);
    // Globale Validierung: keine Kurse gefunden
    if (!parsed.courses.length) parsed.errors.push('Keine Kurse erkannt (Titelzeile leer?)');

    // Prüfe existierende Titel in DB
    const titles = parsed.courses.map(c=>c.title.trim()).filter(Boolean);
    if (titles.length) {
      const existing = await Course.find({ title: { $in: titles } }, 'title').lean();
      const existingTitles = new Set(existing.map(e=> String((e as any).title).toLowerCase()));
      parsed.courses.forEach(c=>{ if (existingTitles.has(c.title.toLowerCase())) c.errors.push('Titel existiert bereits'); });
    }

    if (mode !== 'commit') {
      // Nur Vorschau liefern
      const summary = parsed.courses.map(c=> ({
        title: c.title,
        category: c.category,
        description: c.description,
        lessons: c.lessons.map(l=> ({
          type: l.type,
          title: l.title,
          errors: l.errors,
          questionCount: (l.type === 'single-choice' || l.type === 'multiple-choice') && l.questions ? l.questions.length
            : l.type === 'minigame' && l.content?.questions ? l.content.questions.length
            : undefined,
          pairCount: (l.type === 'matching' || l.type === 'memory') && l.content?.pairs ? l.content.pairs.length : undefined
        })),
        lessonCount: c.lessons.length,
        errors: c.errors
      }));
      return NextResponse.json({ success:true, preview: summary, errors: parsed.errors });
    }

    // Commit: Abbruch bei Fehlern
    const blocking = parsed.errors.length || parsed.courses.some(c=> c.errors.length || c.lessons.some(l=> l.errors.length));
    if (blocking) {
      return NextResponse.json({ success:false, error:'Import abgebrochen wegen Fehlern', preview: parsed }, { status:400 });
    }

    const author = (session.user as any).username || 'author';
    const created: { courseId: string; lessons: number }[] = [];
  for (const pc of parsed.courses) {
      const course = await Course.create({
        title: pc.title,
        description: pc.description || ('Importiert am ' + new Date().toLocaleString('de-DE')),
        category: pc.category,
        tags: [],
        author,
        lessons: [],
        // Import-Defaults: sofort veröffentlicht & freie Reihenfolge
        isPublished: true,
        progressionMode: 'free'
      });
      let order = 0;
      for (const pl of pc.lessons) {
        if (['markdown','video','single-choice','multiple-choice','matching','memory','ordering','lueckentext','text-answer','minigame'].includes(pl.type)) {
          const base:any = { title: pl.title, courseId: String(course._id), category: pc.category, type: pl.type, order: order++ };
          if (pl.questions) base.questions = pl.questions;
          if (pl.content) base.content = pl.content;
          // Spezielle Behandlung: Matching -> aus pairBlocks Fragen generieren (falls keine questions vorhanden)
          if (pl.type === 'matching' && !base.questions) {
            const pairs = (pl.content && (pl.content as any).pairs) || [];
            const pairBlocks = (pl.content && (pl.content as any).pairBlocks) || [];
            const blocks = Array.isArray(pairBlocks) && pairBlocks.length ? pairBlocks : (pairs.length ? [pairs] : []);
            if (blocks.length) {
              const shuffle = <T,>(arr:T[])=> arr.map(v=>[Math.random(),v] as const).sort((a,b)=>a[0]-b[0]).map(([,v])=>v);
              base.questions = blocks.map((block:any[])=>{
                const lefts = block.map(p=>p.left);
                const rights = block.map(p=>p.right);
                const allMixed = shuffle([...lefts, ...rights]);
                return {
                  question: 'Finde die passenden Paare',
                  correctAnswers: block.map(p=> `${p.left}=>${p.right}`),
                  wrongAnswers: [],
                  allAnswers: allMixed
                };
              });
            }
          }
          await Lesson.create(base);
        } else {
          // unbekannter Typ ignorieren
        }
      }
      created.push({ courseId: String(course._id), lessons: order });
    }
    return NextResponse.json({ success:true, created });
  } catch (e) {
    console.error('Import Fehler', e);
    return NextResponse.json({ success:false, error:'Serverfehler beim Import', details: process.env.NODE_ENV!=='production'? String(e): undefined }, { status:500 });
  }
}
