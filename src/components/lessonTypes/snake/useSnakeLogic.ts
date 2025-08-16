import { useState, useEffect, useRef, useCallback } from 'react';
import type { Lesson, LessonContent } from '../types';
import type { Point, QuestionBlock, Food } from './types';
import { COLS, ROWS, COLORS } from './constants';
import { finalizeLesson } from '../../../lib/lessonCompletion';

interface Params {
  lesson: Lesson;
  courseId: string;
  completedLessons: string[];
  setCompletedLessons: (v: string[] | ((p:string[])=>string[]))=>void;
  sessionUsername?: string;
}

const DEFAULT_TARGET_SCORE = 15;

export function useSnakeLogic({ lesson, courseId, completedLessons, setCompletedLessons, sessionUsername }: Params){
  const content = (lesson.content as LessonContent | undefined) || {};
  const targetScore: number = Number(content.targetScore) || DEFAULT_TARGET_SCORE;
  const difficulty: 'einfach'|'mittel'|'schwer' = content.difficulty === 'schwer' ? 'schwer' : (content.difficulty === 'einfach' ? 'einfach' : 'mittel');
  // Harte Grenzen, damit es nie zu schnell wird
  const MIN_TICK = 300; // ms pro Schritt (Minimum)
  const MAX_TICK = 1500; // ms pro Schritt (Maximum)
  // Deutlich langsamere Defaults (überschreibbar via content.initialSpeedMs, aber geklemmt)
  const defaultByDiff = difficulty === 'schwer' ? 400 : (difficulty === 'einfach' ? 600 : 500);
  const requested = Number((content as any).initialSpeedMs);
  const base = Number.isFinite(requested) && requested > 0 ? requested : defaultByDiff;
  const initialSpeed: number = Math.min(MAX_TICK, Math.max(MIN_TICK, base));

  const blocks = Array.isArray(content.blocks) ? (content.blocks as QuestionBlock[]) : [];

  const [snake, setSnake] = useState<Point[]>([{ x: 5, y: 8 }]);
  const [dir, setDir] = useState<Point>({ x: 1, y: 0 });
  const dirRef = useRef(dir);
  const [food, setFood] = useState<Point>({ x: 10, y: 8 });
  const [foods, setFoods] = useState<Food[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<QuestionBlock | null>(blocks.length ? blocks[0] : null);
  const [score, setScore] = useState(0);
  const [tickMs, setTickMs] = useState(initialSpeed);
  const [running, setRunning] = useState(false); // Start erst nach Klick/Space
  const [finished, setFinished] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [marking, setMarking] = useState(false);

  // Guards
  const questionIdRef = useRef(0);
  const lastScoredQuestionIdRef = useRef(-1);
  const requestNewQuestionRef = useRef(false);
  const lastScorePostedRef = useRef(0);

  const shuffle = useCallback(<T,>(arr:T[]):T[] => arr.map(v=>[Math.random(),v] as const).sort((a,b)=>a[0]-b[0]).map(([,v])=>v),[]);
  const pickNextQuestion = useCallback(()=>{ if(!blocks.length) return null; const idx=Math.floor(Math.random()*blocks.length); return blocks[idx]; },[blocks]);

  const placeAnswerFoods = useCallback((q: QuestionBlock, exclude: Point[] = []) => {
    const used: Array<{x:number;y:number}> = [...exclude.map(p=>({x:p.x,y:p.y}))];
    const bodySnapshot = exclude.length ? exclude : snake;
    const randPos = () => { while(true){ const x=Math.floor(Math.random()*(COLS-2))+1; const y=Math.floor(Math.random()*(ROWS-2))+1; if(!used.some(p=>p.x===x&&p.y===y) && !bodySnapshot.some(s=>s.x===x&&s.y===y)) return {x,y}; } };
    const indices = q.answers.map((_,i)=>i);
    const shuffled = shuffle(indices);
    const foodsLocal: Food[] = [];
    shuffled.slice(0,4).forEach((ai,i)=>{ const pos=randPos(); used.push(pos); foodsLocal.push({ x:pos.x,y:pos.y,color:COLORS[i%COLORS.length],answer:q.answers[ai], correct: ai===q.correct }); });
    const head = bodySnapshot[0];
    if(foodsLocal.some(f=>f.x===head.x && f.y===head.y)) return placeAnswerFoods(q, bodySnapshot);
    setFoods(foodsLocal);
  },[snake, shuffle]);

  const placeFood = useCallback((body: Point[]) => { while(true){ const p={ x:Math.floor(Math.random()*COLS), y:Math.floor(Math.random()*ROWS)}; if(!body.some(b=>b.x===p.x && b.y===p.y)){ setFood(p); return; } } },[]);

  // Keyboard
  useEffect(()=>{ const handle=(e:KeyboardEvent)=>{ if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) e.preventDefault(); if(e.key===' '){ if(!finished && !gameOver) setRunning(r=>!r); return; } if(!running||finished||gameOver) return; if(e.key==='ArrowUp' && dirRef.current.y!==1) setDir({x:0,y:-1}); else if(e.key==='ArrowDown' && dirRef.current.y!==-1) setDir({x:0,y:1}); else if(e.key==='ArrowLeft' && dirRef.current.x!==1) setDir({x:-1,y:0}); else if(e.key==='ArrowRight' && dirRef.current.x!==-1) setDir({x:1,y:0}); }; window.addEventListener('keydown',handle); return ()=>window.removeEventListener('keydown',handle); },[running, finished, gameOver]);
  useEffect(()=>{ dirRef.current = dir; },[dir]);

  // Initial Setup – nur bei Blocks-Änderung, nicht bei jeder Bewegung
  useEffect(()=>{
    if(blocks.length){
      const q = pickNextQuestion();
      if(q){
        questionIdRef.current = 0;
        lastScoredQuestionIdRef.current = -1;
        setCurrentQuestion(q);
        placeAnswerFoods(q, snake);
      }
    } else {
      placeFood(snake);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks.length]);

  // Game Loop
  useEffect(()=>{ if(!running || finished) return; const id=setTimeout(()=>{ setSnake(prev=>{ const head=prev[0]; const next={ x: head.x + dirRef.current.x, y: head.y + dirRef.current.y }; if(next.x<0||next.x>=COLS||next.y<0||next.y>=ROWS){ setRunning(false); setGameOver(true); return prev; } const newBody=[next,...prev]; const collision=newBody.slice(1).some(p=>p.x===next.x && p.y===next.y); if(collision){ setRunning(false); setGameOver(true); return prev; } if(blocks.length){ const hit=foods.find(f=>f.x===next.x && f.y===next.y); if(hit){ if(hit.correct){ if(lastScoredQuestionIdRef.current!==questionIdRef.current){ lastScoredQuestionIdRef.current=questionIdRef.current; setScore(s=>s+1); requestNewQuestionRef.current=true; } } else { setRunning(false); setGameOver(true); return prev; } } else { newBody.pop(); } } else { let ate=false; if(next.x===food.x && next.y===food.y){ ate=true; setScore(s=>s+1); placeFood(newBody); } if(!ate) newBody.pop(); } return newBody; }); }, tickMs); return ()=>clearTimeout(id); },[tickMs, running, finished, food, foods, blocks.length, placeFood, placeAnswerFoods, pickNextQuestion]);

  // After scoring -> new question (nur wenn Score sich ändert)
  useEffect(()=>{
    if(requestNewQuestionRef.current && !gameOver && !finished){
      requestNewQuestionRef.current = false;
      const nq = pickNextQuestion();
      if(nq){
        questionIdRef.current += 1;
        setCurrentQuestion(nq);
        // platziere Antworten bezogen auf aktuelle Snake-Position
        placeAnswerFoods(nq, snake);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score]);

  // Completion
  useEffect(()=>{ if(finished) return; if(score >= targetScore && !completedLessons.includes(lesson._id)){ setFinished(true); (async()=>{ try { if(lastScorePostedRef.current >= targetScore) return; lastScorePostedRef.current = targetScore; setMarking(true); await finalizeLesson({ username: sessionUsername, lessonId: lesson._id, courseId, type: lesson.type, earnedStar: lesson.type !== 'markdown' }); setCompletedLessons(prev=> prev.includes(lesson._id)? prev: [...prev, lesson._id]); } finally { setMarking(false);} })(); } },[score, targetScore, finished, completedLessons, lesson._id, lesson.type, courseId, sessionUsername, setCompletedLessons]);

  const restart = useCallback(()=>{ const startBody=[{x:5,y:8}]; setSnake(startBody); setDir({x:1,y:0}); setScore(0); setTickMs(initialSpeed); setRunning(false); setFinished(false); setGameOver(false); lastScorePostedRef.current=0; questionIdRef.current=0; lastScoredQuestionIdRef.current=-1; requestNewQuestionRef.current=false; if(blocks.length){ const nq=pickNextQuestion(); if(nq){ setCurrentQuestion(nq); placeAnswerFoods(nq, startBody);} } else { placeFood(startBody); } },[blocks.length, initialSpeed, pickNextQuestion, placeAnswerFoods, placeFood]);

  const setDirection = useCallback((d:'up'|'down'|'left'|'right')=>{
    if(!running || finished || gameOver) return;
    if(d==='up' && dirRef.current.y!==1) setDir({x:0,y:-1});
    else if(d==='down' && dirRef.current.y!==-1) setDir({x:0,y:1});
    else if(d==='left' && dirRef.current.x!==1) setDir({x:-1,y:0});
    else if(d==='right' && dirRef.current.x!==-1) setDir({x:1,y:0});
  },[running, finished, gameOver]);

  return {
    // state
    snake, foods, food, score, running, finished, gameOver, showHelp, currentQuestion, targetScore, marking,
    tickMs,
    // actions
    setShowHelp, setRunning, restart, setDirection, setTickMs,
    // meta
    blocksLength: blocks.length,
  };
}
