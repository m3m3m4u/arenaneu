"use client";
import { useState, useEffect, useMemo, ComponentType } from 'react';
import type { Lesson } from './types';
import { finalizeLesson } from '../../lib/lessonCompletion';
import { LessonFooterNavigation } from './index';
import { useMaskedMarkdown } from './lueckentext/useMaskedMarkdown';
import { useGapState } from './lueckentext/useGapState';
import type { Gap, Mode } from './lueckentext/types';

interface Props {
  lesson: Lesson;
  courseId: string;
  completedLessons: string[];
  setCompletedLessons: (v: string[] | ((p: string[]) => string[])) => void;
  sessionUsername?: string;
  allLessons?: Lesson[]; // optional für Footer Navigation
  progressionMode?: 'linear' | 'free';
  backHref?: string;
  showFooter?: boolean; // Standard: true
}
export default function LueckentextPlayer({ lesson, courseId, completedLessons, setCompletedLessons, sessionUsername, allLessons = [], progressionMode = 'free', backHref, showFooter = true }: Props) {
  const [InlineMD, setInlineMD]= useState<ComponentType<any>|null>(null); const [gfm,setGfm]=useState<any>(null);
  useEffect(()=>{ let mounted=true;(async()=>{ const m= await import('react-markdown'); const g= await import('remark-gfm'); if(!mounted) return; setInlineMD(()=> m.default as any); setGfm(()=> (g as any).default ?? g);})(); return ()=>{mounted=false}; },[]);
  const c= (lesson.content||{}) as any; const masked: string= String(c.markdownMasked||''); const gaps: Gap[] = Array.isArray(c.gaps)? c.gaps.map((g:any)=>({id:g.id, answer:String(g.answer)})):[]; const mode: Mode = c.mode==='drag'?'drag':'input';
  const { answersState, setAnswersState, checked, setChecked, correctAll, setCorrectAll, usedAnswers, setUsedAnswers, focusGap, setFocusGap, allFilled, resetChecked } = useGapState({ gaps, mode });
  const { parts } = useMaskedMarkdown({ masked, gaps });
  // Antwort-Bank: alphabetisch (stabil), nicht mehr zufällig gemischt
  const bank = useMemo(()=>{
    if(mode!=='drag') return [] as string[];
    const answers = gaps.map(g=>g.answer);
    answers.sort((a,b)=> a.localeCompare(b,'de',{sensitivity:'base'}));
    return answers;
  },[mode,gaps]);

  const check=()=>{
    const allCorrectNow = gaps.every(g=> (answersState[g.id]||'').trim() === g.answer.trim());
    let next = { ...answersState };
    if(mode==='drag' && !allCorrectNow){
      // Falsche Antworten leeren, korrekte bleiben stehen
      for(const g of gaps){
        const val = (next[g.id]||'').trim();
        if(val && val !== g.answer.trim()) next[g.id] = '';
      }
      setAnswersState(next);
      setUsedAnswers(Object.values(next).filter(Boolean));
    }
    setChecked(true);
    setCorrectAll(allCorrectNow);
    if(allCorrectNow && !completedLessons.includes(lesson._id)){
      (async()=>{
        try{
          await finalizeLesson({ username: sessionUsername, lessonId: lesson._id, courseId: lesson.courseId, type: lesson.type, earnedStar: lesson.type !== 'markdown' });
          setCompletedLessons(prev=> prev.includes(lesson._id)? prev : [...prev, lesson._id]);
        }catch{}
      })();
    }
  };
  const answerStatus=(id:number)=>{ if(!checked) return null; const val=(answersState[id]||'').trim(); if(!val) return null; const answer= gaps.find(g=>g.id===id)?.answer||''; if(val===answer.trim()) return 'correct'; return 'wrong'; };
  const renderPart=(part:string,idx:number)=>{
    const m= part.match(/^___(\d+)___$/);
    if(!m){
      // Führende Spaces nach Zeilenumbrüchen entfernen -> sonst "Freiraum" am Zeilenanfang
      const cleaned = part.replace(/(^|\n)[ \t]+/g, '$1');
      if(!InlineMD) return <span key={idx} className="whitespace-pre-wrap leading-relaxed">{cleaned}</span>;
      const Comp=InlineMD;
      return <span key={idx} className="inline whitespace-pre-wrap leading-relaxed"><Comp remarkPlugins={gfm? [gfm]: []} components={{ p: ({children}:{children:any})=> <span className="inline">{children}</span> }}>{cleaned}</Comp></span>;
    }
    const id= Number(m[1]);
    const status= answerStatus(id);
    if(mode==='input'){
      const val= answersState[id]||'';
      return <input
        key={idx}
        value={val}
        onFocus={()=>setFocusGap(id)}
        onChange={e=>{ setAnswersState(s=>({...s,[id]:e.target.value})); resetChecked(); }}
        className={`mx-1 px-2 pb-0.5 border-b-2 outline-none bg-transparent min-w-[60px] text-base transition-colors font-medium tracking-wide focus:border-blue-600 ${status==='correct'? 'border-green-500 text-green-700': status==='wrong'? 'border-red-500 text-red-600':'border-blue-400'} ${focusGap===id? 'bg-blue-50':''}`}
        aria-label={`Lücke ${id}`}
      />;
    }
    const val= answersState[id];
    const base='mx-1 align-baseline inline-flex items-center justify-center rounded-md text-sm font-medium px-2 h-7 min-w-[56px] transition-all duration-150';
    const cls = status==='correct'
      ? 'bg-green-100 text-green-800 ring-1 ring-green-300'
      : status==='wrong'
        ? 'bg-red-100 text-red-700 ring-1 ring-red-300'
        : val
          ? 'bg-blue-100 text-blue-800 ring-1 ring-blue-300'
          : 'bg-transparent text-yellow-700 ring-1 ring-yellow-400/60 border-dashed';
    return <span
      key={idx}
      tabIndex={0}
      onFocus={()=>setFocusGap(id)}
      onKeyDown={e=>{ if(mode==='drag' && e.key==='Enter'){ const remaining= bank.filter(b=> !Object.values(answersState).includes(b)); if(remaining.length){ setAnswersState(s=>({...s,[id]: remaining[0]})); resetChecked();} } }}
      onDragOver={e=>{ e.preventDefault(); }}
      onDrop={e=>{ const ans=e.dataTransfer.getData('text/plain'); if(!ans) return; setAnswersState(s=>({...s,[id]:ans})); setUsedAnswers(u=>[...u,ans]); resetChecked(); }}
      className={`${base} ${cls} ${focusGap===id? 'outline outline-2 outline-blue-300':''}`}
      aria-label={`Lücke ${id}`}
    >{val? val: <span className="opacity-40 select-none tracking-wider">_____</span>}</span>;
  };

  return <div className="bg-white rounded shadow p-6">
    <div className="text-base leading-8 flex flex-wrap">{parts.map(renderPart)}</div>
    {mode==='drag' && <div className="mt-6">
      <h3 className="font-semibold mb-2 text-base">Antworten</h3>
      <div className="flex flex-wrap gap-2">
        {bank.map(ans=>{ const used= Object.values(answersState).includes(ans); return <button
          key={ans}
          draggable={!used}
          onDragStart={e=>{ e.dataTransfer.setData('text/plain', ans); }}
          onClick={()=>{ const free= gaps.find(g=> !answersState[g.id]); if(free) { setAnswersState(s=>({...s,[free.id]: ans})); resetChecked(); } }}
          disabled={used}
          className={`px-2.5 h-8 inline-flex items-center rounded-md border text-sm font-medium shadow-sm transition-colors ${used? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed line-through':'bg-white hover:bg-blue-50 border-blue-300 text-blue-700'}`}
          aria-label={`Antwort ${ans}${used? ' (verwendet)':''}`}
        >{ans}</button>; })}
      </div>
    </div>}
    <div className="mt-6 flex items-center gap-3 flex-wrap">
      <button onClick={check} disabled={checked && correctAll} className={`px-5 py-2.5 rounded text-white text-base font-semibold ${checked && correctAll? 'bg-green-500 cursor-default':'bg-blue-600 hover:bg-blue-700'}`}>{checked ? (correctAll? '✔️ Fertig':'Erneut prüfen'): 'Überprüfen'}</button>
      {checked && !correctAll && <span className="text-base text-red-600">Noch nicht alles korrekt.</span>}
      {checked && correctAll && <span className="text-base text-green-600">Alle richtig!</span>}
      {!allFilled && mode==='input' && <span className="text-sm text-gray-500">Alle Felder ausfüllen.</span>}
    </div>
    {showFooter && <LessonFooterNavigation allLessons={allLessons} currentLessonId={lesson._id} courseId={courseId} completedLessons={completedLessons} progressionMode={progressionMode} backHref={backHref} />}
  </div>;
}
