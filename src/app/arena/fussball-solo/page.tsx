"use client";
import { useEffect, useMemo, useRef, useState } from 'react';

// Ehemaliger Einzelplayer-Prototyp (Ball bewegen). Jetzt ausgelagert unter /arena/fussball-solo
interface Vec { x:number; y:number; }

export default function FussballSoloProto(){
  const canvasRef = useRef<HTMLCanvasElement|null>(null);
  const [running,setRunning] = useState(true);
  const [size,setSize] = useState({w:800,h:450});
  const FIELD_IMAGES = useMemo(() => [
    '/media/spielfelder/spielfeld1.JPG',
    '/media/spielfelder/spielfeld2.JPG',
    '/media/spielfelder/spielfeld3.JPG',
    '/media/spielfelder/spielfeld4.JPG',
    '/media/spielfelder/spielfeld5.JPG',
    '/media/spielfelder/spielfeld6.JPG',
    '/media/spielfelder/spielfeld7.JPG',
  ], []);
  const [bgIdx, setBgIdx] = useState<number>(() => Math.floor(Math.random()*7));
  const bgImg = useRef<HTMLImageElement|null>(null);
  const ball = useRef<{pos:Vec; vel:Vec; r:number}>({ pos:{x:400,y:225}, vel:{x:0,y:0}, r:14 });
  const keys = useRef<Record<string,boolean>>({});
  const lastTime = useRef<number>(0);

  useEffect(()=>{ function onResize(){ const w=Math.min(window.innerWidth-40,960); const h=Math.round(w*9/16); setSize({w,h}); } onResize(); window.addEventListener('resize',onResize); return()=>window.removeEventListener('resize',onResize); },[]);
  useEffect(()=>{ function down(e:KeyboardEvent){ keys.current[e.key.toLowerCase()] = true; } function up(e:KeyboardEvent){ keys.current[e.key.toLowerCase()] = false; } window.addEventListener('keydown',down); window.addEventListener('keyup',up); return()=>{ window.removeEventListener('keydown',down); window.removeEventListener('keyup',up); }; },[]);
  useEffect(()=>{ let frame:number; function loop(ts:number){ if(!running){ frame=requestAnimationFrame(loop); return; } const dt=(ts-lastTime.current)/1000||0; lastTime.current=ts; step(dt); draw(); frame=requestAnimationFrame(loop);} frame=requestAnimationFrame(loop); return()=>cancelAnimationFrame(frame); },[running,size.w,size.h,bgIdx]);

  // Hintergrundbild laden, wenn Index wechselt
  useEffect(()=>{
    const img = new Image();
    img.src = FIELD_IMAGES[bgIdx % FIELD_IMAGES.length];
    img.onload = () => { bgImg.current = img; draw(); };
    img.onerror = () => { bgImg.current = null; };
    return () => { /* no revoke needed for same-origin static */ };
  },[bgIdx, FIELD_IMAGES]);

  function step(dt:number){ const b=ball.current; const acc=400; let ax=0,ay=0; if(keys.current['arrowleft']||keys.current['a']) ax-=acc; if(keys.current['arrowright']||keys.current['d']) ax+=acc; if(keys.current['arrowup']||keys.current['w']) ay-=acc; if(keys.current['arrowdown']||keys.current['s']) ay+=acc; b.vel.x+=ax*dt; b.vel.y+=ay*dt; const damp=0.92; b.vel.x*=damp; b.vel.y*=damp; b.pos.x+=b.vel.x*dt; b.pos.y+=b.vel.y*dt; const {w,h}=size; if(b.pos.x<b.r){ b.pos.x=b.r; b.vel.x=-b.vel.x*0.5;} if(b.pos.x>w-b.r){ b.pos.x=w-b.r; b.vel.x=-b.vel.x*0.5;} if(b.pos.y<b.r){ b.pos.y=b.r; b.vel.y=-b.vel.y*0.5;} if(b.pos.y>h-b.r){ b.pos.y=h-b.r; b.vel.y=-b.vel.y*0.5;} }
  function draw(){
    const cvs=canvasRef.current; if(!cvs)return; const ctx=cvs.getContext('2d'); if(!ctx)return; const {w,h}=size;
    ctx.clearRect(0,0,w,h);
    // Hintergrundfoto als Cover zeichnen
    const img = bgImg.current;
    if(img && img.width && img.height){
      const scale = Math.max(w / img.width, h / img.height);
      const dw = img.width * scale; const dh = img.height * scale;
      const dx = (w - dw) / 2; const dy = (h - dh) / 2;
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img, dx, dy, dw, dh);
      ctx.restore();
    } else {
      // Fallback grün
      ctx.fillStyle='#0b7d2b';
      ctx.fillRect(0,0,w,h);
    }
    // Linien obenauf (vereinfacht)
    ctx.strokeStyle='#ffffff'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(w/2,0); ctx.lineTo(w/2,h); ctx.stroke(); ctx.beginPath(); ctx.arc(w/2,h/2,Math.min(w,h)/10,0,Math.PI*2); ctx.stroke();
    ctx.strokeStyle='#ffd700'; ctx.strokeRect(0,h/2-60,30,120); ctx.strokeRect(w-30,h/2-60,30,120);
    // Ball
    const b=ball.current; ctx.fillStyle='#ffffff'; ctx.beginPath(); ctx.arc(b.pos.x,b.pos.y,b.r,0,Math.PI*2); ctx.fill(); ctx.strokeStyle='#222'; ctx.stroke();
  }

  return (
    <main className="max-w-5xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-2">⚽ Fußball Solo‑Prototyp</h1>
      <p className="text-sm text-gray-600 mb-4">Dieser Einzelspieler-Demo war vorher unter /arena/fussball. Die Lobby & Mehrspieler findest du jetzt dort. Ball mit Pfeilen / WASD bewegen.</p>
      <div className="border rounded bg-white shadow p-3 inline-block relative">
        <canvas ref={canvasRef} width={size.w} height={size.h} className="block max-w-full" />
        <div className="absolute top-2 right-2 flex gap-1">
          <button onClick={()=> setBgIdx(i=> (i-1+FIELD_IMAGES.length)%FIELD_IMAGES.length)} className="px-2 py-1 text-[10px] rounded bg-white/70 hover:bg-white text-gray-900">◀</button>
          <button onClick={()=> setBgIdx(i=> (i+1)%FIELD_IMAGES.length)} className="px-2 py-1 text-[10px] rounded bg-white/70 hover:bg-white text-gray-900">▶</button>
        </div>
      </div>
      <div className="mt-3 flex gap-2 text-xs text-gray-500 flex-wrap items-center">
        <span>Steuerung: Pfeile / WASD</span>
        <button onClick={()=>setRunning(r=>!r)} className="px-2 py-1 border rounded bg-gray-50 hover:bg-gray-100">{running?'Pause':'Start'}</button>
        <button onClick={()=>{ ball.current.pos={x:size.w/2,y:size.h/2}; ball.current.vel={x:0,y:0}; }} className="px-2 py-1 border rounded bg-gray-50 hover:bg-gray-100">Reset</button>
        <span className="text-[10px] text-gray-400">Hintergrund: {bgIdx+1}/{FIELD_IMAGES.length}</span>
        <a href="/arena/fussball" className="px-2 py-1 border rounded bg-indigo-600 text-white hover:bg-indigo-700">Zur Lobby</a>
      </div>
    </main>
  );
}
