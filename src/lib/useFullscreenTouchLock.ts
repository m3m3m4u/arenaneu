"use client";
import { useEffect } from 'react';

/**
 * useFullscreenTouchLock
 * Einheitliche Sperre gegen iOS Safari Systemgesten (Pull-Down Refresh, Edge-Swipe Back) im Vollbild.
 * Aufruf nur aktiv (enabled=true) wenn Komponente im Fullscreen-Modus ist – reduziert globale Side Effects.
 */
export function useFullscreenTouchLock(enabled: boolean, opts?: { edgeWidth?: number; topEdgeHeight?: number }){
  useEffect(()=>{
    if(!enabled) return;
    const edge = opts?.edgeWidth ?? 30;
    const topEdge = opts?.topEdgeHeight ?? 30;
    const preventMove = (e: TouchEvent)=>{ if(e.touches.length===1){ try { e.preventDefault(); } catch {} } };
    const preventStart = (e: TouchEvent)=>{ const t=e.touches[0]; if(!t) return; if(t.clientX < edge || t.clientY < topEdge){ try { e.preventDefault(); } catch {} } };
    // Zusätzliche Sperren: Pinch/Zoom und Scroll (Desktop/Android Chrom)
    const preventGesture = (e: Event)=>{ try { e.preventDefault(); } catch {} };
    const preventWheel = (e: WheelEvent)=>{ try { e.preventDefault(); } catch {} };
    document.addEventListener('touchmove', preventMove, { passive:false, capture:true });
    document.addEventListener('touchstart', preventStart, { passive:false, capture:true });
    document.addEventListener('gesturestart' as any, preventGesture as any, { passive:false, capture:true } as any);
    document.addEventListener('gesturechange' as any, preventGesture as any, { passive:false, capture:true } as any);
    document.addEventListener('wheel', preventWheel, { passive:false, capture:true });
    const prev = document.documentElement.style.overscrollBehavior;
    document.documentElement.style.overscrollBehavior='none';
    return ()=>{
      document.removeEventListener('touchmove', preventMove, { capture:true } as any);
      document.removeEventListener('touchstart', preventStart, { capture:true } as any);
      document.removeEventListener('gesturestart' as any, preventGesture as any, { capture:true } as any);
      document.removeEventListener('gesturechange' as any, preventGesture as any, { capture:true } as any);
      document.removeEventListener('wheel', preventWheel as any, { capture:true } as any);
      document.documentElement.style.overscrollBehavior = prev;
    };
  },[enabled, opts?.edgeWidth, opts?.topEdgeHeight]);
}

export default useFullscreenTouchLock;