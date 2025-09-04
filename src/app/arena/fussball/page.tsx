"use client";
import { useEffect, useRef, useState } from 'react';

// Platzhalter Grundgerüst für neues Arena-Spiel "Fußball"
// Geplant: Realtime / Tick Loop, Ball-Physik, Spieler-Avatare, Punkte, Timer, evtl. WebSocket
// Aktuell: einfache Demo mit beweglichem Ball per Tastatur (Pfeile) als Ausgangspunkt

interface Vec { x:number; y:number; }

export default function FussballGamePage(){
  const canvasRef = useRef<HTMLCanvasElement|null>(null);
  const [running,setRunning] = useState(true);
  const [size,setSize] = useState({w:800,h:450});
  const ball = useRef<{pos:Vec; vel:Vec; r:number}>({ pos:{x:400,y:225}, vel:{x:0,y:0}, r:14 });
  const keys = useRef<Record<string,boolean>>({});
  const lastTime = useRef<number>(0);

  useEffect(()=>{
    function onResize(){
      const w = Math.min(window.innerWidth-40, 960);
      const h = Math.round(w*9/16);
      setSize({w,h});
    }
    onResize();
    window.addEventListener('resize', onResize);
    return ()=> window.removeEventListener('resize', onResize);
  },[]);

  useEffect(()=>{
    function down(e:KeyboardEvent){ keys.current[e.key.toLowerCase()] = true; }
    function up(e:KeyboardEvent){ keys.current[e.key.toLowerCase()] = false; }
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return ()=> { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  },[]);

  useEffect(()=>{
    let frame:number;
    function loop(ts:number){
      if(!running){ frame = requestAnimationFrame(loop); return; }
      const dt = (ts - lastTime.current)/1000 || 0; lastTime.current = ts;
      step(dt);
      draw();
      frame = requestAnimationFrame(loop);
    }
    frame = requestAnimationFrame(loop);
    return ()=> cancelAnimationFrame(frame);
  },[running, size.w, size.h]);

  function step(dt:number){
    const b = ball.current;
    // Steuerung: einfacher Impuls
    const acc = 400;
    let ax=0, ay=0;
    if(keys.current['arrowleft']||keys.current['a']) ax -= acc;
    if(keys.current['arrowright']||keys.current['d']) ax += acc;
    if(keys.current['arrowup']||keys.current['w']) ay -= acc;
    if(keys.current['arrowdown']||keys.current['s']) ay += acc;
    b.vel.x += ax*dt; b.vel.y += ay*dt;
    // Dämpfung
    const damp = 0.92; b.vel.x *= damp; b.vel.y *= damp;
    // Positionsupdate
    b.pos.x += b.vel.x*dt; b.pos.y += b.vel.y*dt;
    // Kollisionsbegrenzung
    const {w,h} = size; if(b.pos.x < b.r){ b.pos.x = b.r; b.vel.x = -b.vel.x*0.5; }
    if(b.pos.x > w-b.r){ b.pos.x = w-b.r; b.vel.x = -b.vel.x*0.5; }
    if(b.pos.y < b.r){ b.pos.y = b.r; b.vel.y = -b.vel.y*0.5; }
    if(b.pos.y > h-b.r){ b.pos.y = h-b.r; b.vel.y = -b.vel.y*0.5; }
  }

  function draw(){
    const cvs = canvasRef.current; if(!cvs) return; const ctx = cvs.getContext('2d'); if(!ctx) return;
    const {w,h} = size; ctx.clearRect(0,0,w,h);
    // Spielfeld
    ctx.fillStyle = '#0b7d2b'; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
    // Mittellinie & Kreis
    ctx.beginPath(); ctx.moveTo(w/2,0); ctx.lineTo(w/2,h); ctx.stroke();
    ctx.beginPath(); ctx.arc(w/2,h/2,60,0,Math.PI*2); ctx.stroke();
    // Tore (Platzhalter)
    ctx.strokeStyle = '#ffd700';
    ctx.strokeRect(0, h/2-60, 30, 120);
    ctx.strokeRect(w-30, h/2-60, 30, 120);
    // Ball
    const b = ball.current; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(b.pos.x,b.pos.y,b.r,0,Math.PI*2); ctx.fill(); ctx.strokeStyle='#222'; ctx.stroke();
  }

  return (
    <main className="max-w-5xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">⚽ Fußball (Prototyp)</h1>
      <p className="text-sm text-gray-600 mb-4">Erster Platzhalter. Pfeile / WASD bewegen momentan direkt den Ball (mit Trägheit). Mehrspieler, Kollisionsphysik, Spielerfiguren, Score & Timer folgen.</p>
      <div className="border rounded bg-white shadow p-3 inline-block">
        <canvas ref={canvasRef} width={size.w} height={size.h} className="block max-w-full" />
      </div>
      <div className="mt-3 flex gap-2 text-xs text-gray-500 flex-wrap">
        <span>Steuerung: Pfeile / WASD</span>
        <button onClick={()=>setRunning(r=>!r)} className="px-2 py-1 border rounded bg-gray-50 hover:bg-gray-100">{running?'Pause':'Start'}</button>
        <button onClick={()=>{ ball.current.pos={x:size.w/2,y:size.h/2}; ball.current.vel={x:0,y:0}; }} className="px-2 py-1 border rounded bg-gray-50 hover:bg-gray-100">Reset</button>
      </div>
    </main>
  );
}
