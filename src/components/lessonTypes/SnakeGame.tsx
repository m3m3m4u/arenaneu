"use client";
import React, { useState, useEffect, useRef } from 'react';
import type { Lesson } from './types';
import { CELL, COLS, ROWS } from './snake/constants';
import useFullscreenTouchLock from '../../lib/useFullscreenTouchLock';
import { useSnakeRendering } from './snake/useSnakeRendering';
import { useSnakeLogic } from './snake/useSnakeLogic';
import { useSession } from 'next-auth/react';
import PlaneGame from './plane/PlaneGame';
import SpaceImpactGame from './space/SpaceImpactGame';
import PacmanGame from './pacman/PacmanGame';
import AutoGame from './auto/AutoGame';
import TwoSnakeGame from './twosnake/TwoSnakeGame';

interface Props { lesson: Lesson; courseId: string; completedLessons: string[]; setCompletedLessons: (v: string[] | ((p:string[])=>string[]))=>void; disableCompletion?: boolean }

export default function SnakeGame({ lesson, courseId, completedLessons, setCompletedLessons, disableCompletion }: Props){
  const [variant, setVariant] = useState<'snake'|'plane'|'space'|'pacman'|'auto'|'twosnake'>('snake');
  const wrapperRef = useRef<HTMLDivElement|null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fsMaxPx, setFsMaxPx] = useState<number | null>(null);
  // Touch: Tap setzt Richtung relativ zur Kopfposition; kein Swipe mehr
  const lastTapRef = useRef<number>(0);
  // iOS Safari Workaround: global touchmove blocker während Vollbild um Pull-Down / UI-Reveal zu minimieren
  useEffect(()=>{
    if(!isFullscreen) return;
    const preventMove = (e: TouchEvent)=>{
      if(e.touches.length===1){ try { e.preventDefault(); } catch {} }
    };
    const preventStart = (e: TouchEvent)=>{
      // Verhindert Swipe-Back Gesten am linken Rand im Vollbild (Heuristik: Start-X < 30px)
      const t = e.touches[0];
      if(t && t.clientX < 30){ try { e.preventDefault(); } catch {} }
    };
    const prevOverscroll = document.documentElement.style.overscrollBehavior;
    document.documentElement.style.overscrollBehavior='none';
    document.addEventListener('touchmove', preventMove, { passive:false, capture:true });
    document.addEventListener('touchstart', preventStart, { passive:false, capture:true });
    return ()=> {
      document.removeEventListener('touchmove', preventMove, { capture:true } as any);
      document.removeEventListener('touchstart', preventStart, { capture:true } as any);
      document.documentElement.style.overscrollBehavior=prevOverscroll;
    };
  },[isFullscreen]);
  // Vereinheitlichte Sperre (künftig nur Hook nutzen – der Block oben bleibt als Übergang / wird später entfernt)
  useFullscreenTouchLock(isFullscreen);
  // Debug Hotkeys: 1..5 oder A für Auto (hilft falls Button gecached fehlt)
  useEffect(()=>{
    const handler = (e:KeyboardEvent)=>{
      if(e.key==='1') setVariant('snake');
      if(e.key==='2') setVariant('plane');
      if(e.key==='3') setVariant('space');
      if(e.key==='4') setVariant('pacman');
      if(e.key==='5' || e.key.toLowerCase()==='a') setVariant('auto');
      if(e.key.toLowerCase()==='f'){
        if(document.fullscreenElement){ exitFullscreen(); } else { enterFullscreen(); }
      }
    };
    window.addEventListener('keydown', handler);
    return ()=> window.removeEventListener('keydown', handler);
  },[]);
  const { data: session } = useSession();
  const { snake, foods, food, score, running, finished, gameOver, showHelp, currentQuestion, targetScore, marking, tickMs, setShowHelp, setRunning, restart, blocksLength, setDirection, setTickMs } = useSnakeLogic({ lesson, courseId, completedLessons, setCompletedLessons, sessionUsername: session?.user?.username, disableCompletion });
  const canvasRef = useSnakeRendering({ snake, foods, food, blocksLength, score, finished, targetScore });

  // Fullscreen API helpers
  const recalcFsSize = (fs: boolean = isFullscreen)=>{
    try {
      const innerW = window.innerWidth;
      const innerH = window.innerHeight;
      const wrapperPadding = 24; // p-3 => 12px * 2
      const colGap = 24; // gap-6
      const isRow = innerW >= 1024; // lg-Breakpoint
      const panelW = isRow ? (fs ? 420 : 320) : 0; // lg:w-80 normal, Vollbild ~420px
      const availW = innerW - wrapperPadding*2 - panelW - (isRow ? colGap : 0);
      const availH = innerH - wrapperPadding*2;
      const size = Math.max(260, Math.min(availW, availH));
      setFsMaxPx(size);
    } catch {}
  };

  const enterFullscreen = async ()=>{
    const el = wrapperRef.current; if(!el) return;
    try {
      // Versuche die UI im Fullscreen auszublenden (Safari/Chromium unterstützen teils navigationUI)
      const anyEl: any = el as any;
      if (anyEl.requestFullscreen) {
        try {
          await anyEl.requestFullscreen({ navigationUI: 'hide' } as any);
        } catch {
          await anyEl.requestFullscreen();
        }
      }
      // Safari prefixes werden hier bewusst weggelassen, Next-Ziel sind moderne Browser
      setIsFullscreen(true);
  recalcFsSize(true);
    } catch {}
  };
  const exitFullscreen = async ()=>{
    try {
      if(document.fullscreenElement){ await document.exitFullscreen(); }
      setIsFullscreen(false);
    } catch {}
  };
  useEffect(()=>{
  const onChange = ()=> { const fs = !!document.fullscreenElement; setIsFullscreen(fs); if(fs){ recalcFsSize(true); } };
    document.addEventListener('fullscreenchange', onChange);
    return ()=> document.removeEventListener('fullscreenchange', onChange);
  },[]);
  useEffect(()=>{
    if(!isFullscreen) return;
    recalcFsSize();
  const onResize = ()=> recalcFsSize(true);
    window.addEventListener('resize', onResize);
    return ()=> window.removeEventListener('resize', onResize);
  },[isFullscreen]);

  if(variant === 'plane'){
    return (
      <div className="w-full flex flex-col gap-3">
        <div className="flex justify-center gap-3 mb-2">
          <button onClick={()=> setVariant('snake')} className="px-5 py-2 text-sm rounded border bg-white shadow-sm hover:bg-gray-50">🐍 Snake</button>
          <button disabled className="px-5 py-2 text-sm rounded border bg-emerald-600 text-white shadow-sm">✈️ Flugzeug</button>
          <button onClick={()=> setVariant('space')} className="px-5 py-2 text-sm rounded border bg-white shadow-sm hover:bg-gray-50">🛸 Space</button>
          <button onClick={()=> setVariant('pacman')} className="px-5 py-2 text-sm rounded border bg-white shadow-sm hover:bg-gray-50">👻 Pacman</button>
            <button onClick={()=> setVariant('auto')} className="px-5 py-2 text-sm rounded border bg-white shadow-sm hover:bg-gray-50">🚗 Auto</button>
            <button onClick={()=> setVariant('twosnake')} className="px-5 py-2 text-sm rounded border bg-white shadow-sm hover:bg-gray-50">🐍 Snake ×2</button>
        </div>
        <PlaneGame lesson={lesson} courseId={courseId} completedLessons={completedLessons} setCompletedLessons={setCompletedLessons} />
      </div>
    );
  }

  if(variant === 'space'){
    return (
      <div className="w-full flex flex-col gap-3">
        <div className="flex justify-center gap-3 mb-2">
          <button onClick={()=> setVariant('snake')} className="px-5 py-2 text-sm rounded border bg-white shadow-sm hover:bg-gray-50">🐍 Snake</button>
          <button onClick={()=> setVariant('plane')} className="px-5 py-2 text-sm rounded border bg-white shadow-sm hover:bg-gray-50">✈️ Flugzeug</button>
          <button disabled className="px-5 py-2 text-sm rounded border bg-violet-600 text-white shadow-sm">🛸 Space</button>
          <button onClick={()=> setVariant('pacman')} className="px-5 py-2 text-sm rounded border bg-white shadow-sm hover:bg-gray-50">👻 Pacman</button>
            <button onClick={()=> setVariant('auto')} className="px-5 py-2 text-sm rounded border bg-white shadow-sm hover:bg-gray-50">🚗 Auto</button>
            <button onClick={()=> setVariant('twosnake')} className="px-5 py-2 text-sm rounded border bg-white shadow-sm hover:bg-gray-50">🐍 Snake ×2</button>
        </div>
        <SpaceImpactGame lesson={lesson} courseId={courseId} completedLessons={completedLessons} setCompletedLessons={setCompletedLessons} />
      </div>
    );
  }

  if(variant === 'pacman'){
    return (
      <div className="w-full flex flex-col gap-3">
        <div className="flex justify-center gap-3 mb-2">
          <button onClick={()=> setVariant('snake')} className="px-5 py-2 text-sm rounded border bg-white shadow-sm hover:bg-gray-50">🐍 Snake</button>
          <button onClick={()=> setVariant('plane')} className="px-5 py-2 text-sm rounded border bg-white shadow-sm hover:bg-gray-50">✈️ Flugzeug</button>
          <button onClick={()=> setVariant('space')} className="px-5 py-2 text-sm rounded border bg-white shadow-sm hover:bg-gray-50">🛸 Space</button>
          <button disabled className="px-5 py-2 text-sm rounded border bg-amber-600 text-white shadow-sm">👻 Pacman</button>
            <button onClick={()=> setVariant('auto')} className="px-5 py-2 text-sm rounded border bg-white shadow-sm hover:bg-gray-50">🚗 Auto</button>
            <button onClick={()=> setVariant('twosnake')} className="px-5 py-2 text-sm rounded border bg-white shadow-sm hover:bg-gray-50">🐍 Snake ×2</button>
        </div>
        <PacmanGame lesson={lesson} courseId={courseId} completedLessons={completedLessons} setCompletedLessons={setCompletedLessons} />
      </div>
    );
  }

  if(variant === 'auto'){
    return (
      <div className="w-full flex flex-col gap-3">
        <div className="flex justify-center gap-3 mb-2">
          <button onClick={()=> setVariant('snake')} className="px-5 py-2 text-sm rounded border bg-white shadow-sm hover:bg-gray-50">🐍 Snake</button>
          <button onClick={()=> setVariant('plane')} className="px-5 py-2 text-sm rounded border bg-white shadow-sm hover:bg-gray-50">✈️ Flugzeug</button>
          <button onClick={()=> setVariant('space')} className="px-5 py-2 text-sm rounded border bg-white shadow-sm hover:bg-gray-50">🛸 Space</button>
          <button onClick={()=> setVariant('pacman')} className="px-5 py-2 text-sm rounded border bg-white shadow-sm hover:bg-gray-50">👻 Pacman</button>
            <button disabled className="px-5 py-2 text-sm rounded border bg-blue-600 text-white shadow-sm">🚗 Auto</button>
            <button onClick={()=> setVariant('twosnake')} className="px-5 py-2 text-sm rounded border bg-white shadow-sm hover:bg-gray-50">🐍 Snake ×2</button>
        </div>
        <AutoGame lesson={lesson} courseId={courseId} completedLessons={completedLessons} setCompletedLessons={setCompletedLessons} />
      </div>
    );
  }

    if(variant === 'twosnake'){
      return (
        <div className="w-full flex flex-col gap-3">
          <div className="flex justify-center gap-3 mb-2">
            <button onClick={()=> setVariant('snake')} className="px-5 py-2 text-sm rounded border bg-white shadow-sm hover:bg-gray-50">🐍 Snake</button>
            <button onClick={()=> setVariant('plane')} className="px-5 py-2 text-sm rounded border bg-white shadow-sm hover:bg-gray-50">✈️ Flugzeug</button>
            <button onClick={()=> setVariant('space')} className="px-5 py-2 text-sm rounded border bg-white shadow-sm hover:bg-gray-50">🛸 Space</button>
            <button onClick={()=> setVariant('pacman')} className="px-5 py-2 text-sm rounded border bg-white shadow-sm hover:bg-gray-50">👻 Pacman</button>
            <button onClick={()=> setVariant('auto')} className="px-5 py-2 text-sm rounded border bg-white shadow-sm hover:bg-gray-50">🚗 Auto</button>
            <button disabled className="px-5 py-2 text-sm rounded border bg-amber-200 text-gray-800 shadow-sm">🐍 Snake ×2</button>
          </div>
          <TwoSnakeGame lesson={lesson} courseId={courseId} completedLessons={completedLessons} setCompletedLessons={setCompletedLessons} />
        </div>
      );
    }

  return (
    <div className="w-full flex flex-col gap-4">
      <div className="flex justify-center gap-3 order-first flex-wrap">
        <button disabled className="px-5 py-2 text-sm rounded border bg-emerald-600 text-white shadow-sm">🐍 Snake</button>
        <button onClick={()=> setVariant('plane')} className="px-5 py-2 text-sm rounded border bg-white shadow-sm hover:bg-gray-50">✈️ Flugzeug</button>
        <button onClick={()=> setVariant('space')} className="px-5 py-2 text-sm rounded border bg-white shadow-sm hover:bg-gray-50">🛸 Space</button>
        <button onClick={()=> setVariant('pacman')} className="px-5 py-2 text-sm rounded border bg-white shadow-sm hover:bg-gray-50">👻 Pacman</button>
  <button onClick={()=> setVariant('auto')} className="px-5 py-2 text-sm rounded border bg-white shadow-sm hover:bg-gray-50">🚗 Auto</button>
  <button onClick={()=> setVariant('twosnake')} className="px-5 py-2 text-sm rounded border bg-white shadow-sm hover:bg-gray-50">🐍 Snake ×2</button>
      </div>
      <div
        ref={wrapperRef}
        className={(isFullscreen ? "fixed inset-0 z-50 bg-white overflow-hidden p-3 " : "") + "w-full flex flex-col lg:flex-row gap-6"}
        onDoubleClick={()=>{ if(document.fullscreenElement){ exitFullscreen(); } else { enterFullscreen(); } }}
        onTouchStart={(e)=>{
          const t=e.touches[0]; if(!t) return;
          // Tap-to-start
          if(!running && !finished && !gameOver){ setRunning(true); }
          const canvas = canvasRef.current; if(!canvas) return;
          const rect = canvas.getBoundingClientRect();
          const rx = (t.clientX - rect.left) / rect.width;
          const ry = (t.clientY - rect.top) / rect.height;
          if(rx<0||rx>1||ry<0||ry>1) return;
          const tapX = rx * COLS; const tapY = ry * ROWS;
          const head = snake[0]; if(!head) return;
          const dx = tapX - (head.x + 0.5);
          const dy = tapY - (head.y + 0.5);
          if(Math.abs(dx) > Math.abs(dy)) setDirection(dx>0? 'right' : 'left');
          else setDirection(dy>0? 'down' : 'up');
          lastTapRef.current = performance.now();
          if(isFullscreen){ try{ e.preventDefault(); }catch{} }
        }}
        onTouchMove={(e)=>{ if(isFullscreen){ try{ e.preventDefault(); }catch{} } }}
        onTouchEnd={()=>{ /* no-op */ }}
        onWheel={(e)=>{ if(isFullscreen){ try{ e.preventDefault(); }catch{} } }}
        style={{ touchAction: isFullscreen ? 'none' : 'manipulation' }}
      >
  <div className={(isFullscreen ? "lg:w-[420px] p-5 text-[0.95rem]" : "lg:w-80 p-4") + " w-full lg:w-auto flex-shrink-0 bg-white border rounded space-y-4 h-fit min-h-[420px]"}>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">🐍 Snake Quiz</h2>
          </div>
          <div className="text-sm space-y-1">
            <div><span className="font-medium">Punkte:</span> {score} / {targetScore}</div>
            <div><span className="font-medium">Status:</span> {finished ? 'Abgeschlossen' : (running ? 'Läuft' : 'Pausiert')}</div>
          </div>
          {!(finished || gameOver) && (
            <div className="flex flex-wrap gap-2 text-xs">
              <button onClick={()=> setRunning(r=>!r)} className="px-3 py-1 rounded border bg-gray-50 hover:bg-white">{running? 'Pause':'Start'}</button>
              <button onClick={()=> setShowHelp(h=>!h)} className="px-3 py-1 rounded border bg-gray-50 hover:bg-white">{showHelp? 'Hilfe ausblenden':'Hilfe'}</button>
              {!isFullscreen ? (
                <button onClick={enterFullscreen} className="px-3 py-1 rounded border bg-gray-50 hover:bg-white">Vollbild</button>
              ) : (
                <button onClick={exitFullscreen} className="px-3 py-1 rounded border bg-gray-50 hover:bg-white">Vollbild beenden</button>
              )}
              <span className="inline-flex items-center gap-1 ml-1 select-none">
                <span className="text-[11px] text-gray-600 mr-1">Tempo:</span>
                <button onClick={()=> setTickMs(600)} className="px-2 py-1 rounded border bg-gray-50 hover:bg-white">Langsam</button>
                <button onClick={()=> setTickMs(420)} className="px-2 py-1 rounded border bg-gray-50 hover:bg-white">Mittel</button>
                <button onClick={()=> setTickMs(300)} className="px-2 py-1 rounded border bg-gray-50 hover:bg-white">Schnell</button>
              </span>
            </div>
          )}
          {blocksLength>0 && currentQuestion && !(finished || gameOver) && (
            <div className="text-sm">
              <div className="text-gray-700 whitespace-pre-wrap break-words">{currentQuestion.question}</div>
            </div>
          )}
          {blocksLength>0 && foods.length === 4 && !(finished || gameOver) && (
            <div className="space-y-1 text-xs">
              <ul className="space-y-1">
                {foods.map((f,i)=>(
                  <li key={i} className="flex items-center gap-2">
                    <span className="inline-block w-4 h-4 rounded-sm border" style={{background:f.color}}></span>
                    <span className="flex-1 break-words">{f.answer}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {showHelp && !(finished || gameOver) && (
            <div className="text-[11px] text-gray-600 border rounded p-2 bg-gray-50 leading-snug">
              Steuerung: Pfeiltasten oder Buttons. Triff das Feld der richtigen Antwortfarbe. Falsche Antwort oder Selbstkollision beendet das Spiel.
            </div>
          )}
          {/* Steuerungs-Buttons */}
          <div className="pt-3 border-t mt-2">
            <div className="text-xs text-gray-500 mb-2">Steuerung</div>
            <div className="grid grid-cols-3 gap-3 w-60 select-none">
              <div />
              <button onClick={()=> setDirection('up')} disabled={!running || finished || gameOver} className="px-4 py-3 rounded-md border bg-gray-50 hover:bg-white disabled:opacity-50 text-sm font-medium">↑</button>
              <div />
              <button onClick={()=> setDirection('left')} disabled={!running || finished || gameOver} className="px-4 py-3 rounded-md border bg-gray-50 hover:bg-white disabled:opacity-50 text-sm font-medium">←</button>
              <button onClick={()=> setRunning(r=>!r)} className="px-4 py-3 rounded-md border bg-gray-50 hover:bg-white text-sm font-semibold whitespace-nowrap">{running? 'Pause':'Start'}</button>
              <button onClick={()=> setDirection('right')} disabled={!running || finished || gameOver} className="px-4 py-3 rounded-md border bg-gray-50 hover:bg-white disabled:opacity-50 text-sm font-medium">→</button>
              <div />
              <button onClick={()=> setDirection('down')} disabled={!running || finished || gameOver} className="px-4 py-3 rounded-md border bg-gray-50 hover:bg-white disabled:opacity-50 text-sm font-medium">↓</button>
              <div />
            </div>
          </div>
        </div>
        <div className="flex-1 flex justify-center">
          <div
            className="inline-block relative w-full"
            onTouchStart={(e)=>{ const t=e.touches[0]; if(!t) return; const canvas=canvasRef.current; if(!canvas) return; const rect=canvas.getBoundingClientRect(); const rx=(t.clientX-rect.left)/rect.width; const ry=(t.clientY-rect.top)/rect.height; if(rx<0||rx>1||ry<0||ry>1) return; const tapX=rx*COLS; const tapY=ry*ROWS; const head=snake[0]; if(!head) return; const dx=tapX-(head.x+0.5); const dy=tapY-(head.y+0.5); if(running && !finished && !gameOver){ if(Math.abs(dx)>Math.abs(dy)) setDirection(dx>0?'right':'left'); else setDirection(dy>0?'down':'up'); } if(isFullscreen){ try{ e.preventDefault(); }catch{} } }}
            onTouchMove={(e)=>{ if(isFullscreen){ try { e.preventDefault(); } catch {}; } }}
            onTouchEnd={()=>{ /* no-op */ }}
            style={{touchAction:'none'}}
          >
            <canvas
              ref={canvasRef}
              width={COLS*CELL}
              height={ROWS*CELL}
              className="border rounded bg-white block mx-auto"
              style={{
                aspectRatio:'1/1',
                width:'100%',
                maxWidth: isFullscreen ? (fsMaxPx ?? '100%') : COLS*CELL,
                maxHeight: isFullscreen ? (fsMaxPx ?? undefined) : undefined,
              }}
            />
            {!running && !finished && !gameOver && score===0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/85 backdrop-blur-sm text-center p-4 gap-2">
                <button onClick={()=> setRunning(true)} onTouchStart={(e)=>{ e.preventDefault(); setRunning(true); }} className="px-6 py-3 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-md text-sm">Start (Leertaste)</button>
                <div className="flex gap-2">
                  {!isFullscreen ? (
                    <button onClick={enterFullscreen} className="px-3 py-1 rounded border bg-gray-50 hover:bg-white text-xs">Vollbild</button>
                  ) : (
                    <button onClick={exitFullscreen} className="px-3 py-1 rounded border bg-gray-50 hover:bg-white text-xs">Vollbild beenden</button>
                  )}
                </div>
                {blocksLength>0 && <div className="mt-1 text-[11px] text-gray-600 max-w-[260px]">Steuere die Schlange zur Farbe der richtigen Antwort. Space oder Button startet. Tempo: {Math.round(tickMs)} ms/Schritt</div>}
              </div>
            )}
            {finished && score >= targetScore && (
              <div className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center text-center p-4">
                <div className="text-green-700 font-semibold mb-2">✔️ Ziel erreicht!</div>
              </div>
            )}
            {gameOver && !finished && (
              <div className="absolute inset-0 bg-white/85 flex flex-col items-center justify-center text-center p-4">
                <div className="text-red-600 font-semibold text-lg mb-2">Game Over</div>
                <div className="text-xs text-gray-600 mb-3">Du bist aus dem Spielfeld oder in dich selbst / falsche Antwort.</div>
                <button onClick={restart} className="px-4 py-2 text-xs rounded bg-red-600 text-white hover:bg-red-700">Neu starten</button>
              </div>
            )}
          </div>
          {marking && <div className="mt-2 text-xs text-gray-500">Speichere Abschluss…</div>}
        </div>
      </div>
    </div>
  );
}
