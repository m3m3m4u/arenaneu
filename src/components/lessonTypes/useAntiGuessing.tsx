"use client";
import { useRef, useState, useEffect, useCallback } from 'react';

export interface AntiGuessingConfig {
  maxWrongStreak?: number; // default 3
  windowMs?: number;       // Zeitfenster (default 12000)
  cooldownMs?: number;     // Blockdauer (default 6000)
}

export function useAntiGuessing(cfg: AntiGuessingConfig = {}) {
  const maxWrong = cfg.maxWrongStreak ?? 3;
  const windowMs = cfg.windowMs ?? 12000;
  const cooldownMs = cfg.cooldownMs ?? 6000;
  const wrongTimesRef = useRef<number[]>([]);
  const [blocked,setBlocked] = useState(false);
  const [until,setUntil] = useState<number|undefined>();
  // Anzahl der bisherigen Block-Events (nur Client, für 3er-Schwelle)
  const blockCountRef = useRef(0);
  const lastReportRef = useRef<number>(0);
  const REPORT_INTERVAL_MS = 5_000; // mindestens 5s Abstand zwischen Reports (Failsafe)

  const registerAnswer = useCallback((correct: boolean)=>{
    if(blocked) return; // während Block ignorieren
    if(!correct){
      const now = Date.now();
      wrongTimesRef.current.push(now);
      wrongTimesRef.current = wrongTimesRef.current.filter(t=> now - t <= windowMs);
      if(wrongTimesRef.current.length >= maxWrong){
        setBlocked(true);
        setUntil(now + cooldownMs);
        blockCountRef.current += 1;
        const shouldReport = (blockCountRef.current % 3 === 0);
        if(shouldReport){
          const since = Date.now() - lastReportRef.current;
          if(since > REPORT_INTERVAL_MS){
            lastReportRef.current = Date.now();
            // Username aus localStorage (Fallback) oder Session via DOM CustomEvent (vereinfachte Variante)
            const username = typeof window !== 'undefined' ? (localStorage.getItem('session:username') || '') : '';
            if(username){
              fetch('/api/anti-guessing/report', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ username }) }).catch(()=>{});
            }
          }
        }
      }
    } else {
      wrongTimesRef.current = []; // Reset der Serie
    }
  },[blocked, windowMs, maxWrong, cooldownMs]);

  useEffect(()=>{
    if(!blocked || !until) return;
    const id = setInterval(()=>{
      if(Date.now() >= until){
        wrongTimesRef.current = [];
        setBlocked(false);
        setUntil(undefined);
      }
    }, 500);
    return ()=> clearInterval(id);
  },[blocked, until]);

  const remainingMs = blocked && until ? Math.max(0, until - Date.now()) : 0;
  const remainingSec = Math.ceil(remainingMs/1000);

  const cooldownSec = Math.ceil(cooldownMs/1000);
  return { blocked, remainingMs, remainingSec, cooldownSec, registerAnswer };
}

export function AntiGuessingOverlay({ remainingSec, totalSec }: { remainingSec: number; totalSec: number }) {
  const safeTotal = totalSec || remainingSec || 1;
  const progressed = Math.min(100, Math.max(0, ((safeTotal - remainingSec)/safeTotal) * 100));
  return (
    <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-xl border border-amber-300 p-6 animate-[fadeIn_.25s_ease-out]">
        <h2 className="text-lg font-semibold mb-3 text-amber-700 flex items-center gap-2">⚠ Nicht raten!</h2>
        <p className="text-sm text-gray-700 leading-snug mb-3">Mehrere Antworten wurden sehr schnell falsch gewählt. Lies dir die Frage genau durch und überlege einen Moment, bevor du klickst.</p>
        <p className="text-xs text-gray-500">Weiter in <span className="font-semibold text-gray-700">{remainingSec}s</span> …</p>
        <div className="mt-4 h-2 bg-amber-100 rounded overflow-hidden">
          <div className="h-full bg-amber-400 transition-all" style={{ width: `${progressed}%` }} />
        </div>
      </div>
      <style jsx global>{`
        @keyframes fadeIn { from { opacity:0; transform: scale(.96);} to { opacity:1; transform:scale(1);} }
      `}</style>
    </div>
  );
}
