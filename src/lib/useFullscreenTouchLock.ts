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

    // Allgemeines Verhindern der Standardaktionen (Scroll, Navigationsgesten, Zoom)
    const preventAll = (e: Event)=>{ try { (e as any).preventDefault?.(); } catch {} };
    // iOS: Zusätzliche Edge-Erkennung, falls wir selektiv blockieren wollen
    const preventEdgeStart = (e: TouchEvent)=>{ const t=e.touches[0]; if(!t) return; if(t.clientX < edge || t.clientY < topEdge){ try { e.preventDefault(); } catch {} } };

    // Listener (capture + passive:false) auf Document und Window
    const optsCap = { capture: true, passive: false } as AddEventListenerOptions;
    const addAll = () => {
      document.addEventListener('touchstart', preventAll as any, optsCap);
      document.addEventListener('touchmove', preventAll as any, optsCap);
      document.addEventListener('touchend', preventAll as any, optsCap);
      document.addEventListener('pointerdown', preventAll as any, optsCap);
      document.addEventListener('pointermove', preventAll as any, optsCap);
      document.addEventListener('wheel', preventAll as any, optsCap);
      document.addEventListener('gesturestart' as any, preventAll as any, optsCap as any);
      document.addEventListener('gesturechange' as any, preventAll as any, optsCap as any);
      document.addEventListener('contextmenu', preventAll as any, optsCap);
      // Edge-Start zusätzlich (redundant aber harmlos)
      document.addEventListener('touchstart', preventEdgeStart, optsCap);
      window.addEventListener('touchstart', preventAll as any, optsCap);
      window.addEventListener('touchmove', preventAll as any, optsCap);
      window.addEventListener('pointermove', preventAll as any, optsCap);
    };
    const removeAll = () => {
      document.removeEventListener('touchstart', preventAll as any, { capture:true } as any);
      document.removeEventListener('touchmove', preventAll as any, { capture:true } as any);
      document.removeEventListener('touchend', preventAll as any, { capture:true } as any);
      document.removeEventListener('pointerdown', preventAll as any, { capture:true } as any);
      document.removeEventListener('pointermove', preventAll as any, { capture:true } as any);
      document.removeEventListener('wheel', preventAll as any, { capture:true } as any);
      document.removeEventListener('gesturestart' as any, preventAll as any, { capture:true } as any);
      document.removeEventListener('gesturechange' as any, preventAll as any, { capture:true } as any);
      document.removeEventListener('contextmenu', preventAll as any, { capture:true } as any);
      document.removeEventListener('touchstart', preventEdgeStart as any, { capture:true } as any);
      window.removeEventListener('touchstart', preventAll as any, { capture:true } as any);
      window.removeEventListener('touchmove', preventAll as any, { capture:true } as any);
      window.removeEventListener('pointermove', preventAll as any, { capture:true } as any);
    };

    addAll();

    // CSS-Locks auf Root
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = { overscrollBehavior: html.style.overscrollBehavior, touchAction: (html.style as any).touchAction } as const;
    const prevBody = { overscrollBehavior: body.style.overscrollBehavior, touchAction: (body.style as any).touchAction, webkitOverflowScrolling: (body.style as any).webkitOverflowScrolling } as const;
    html.style.overscrollBehavior = 'none';
    (html.style as any).touchAction = 'none';
    body.style.overscrollBehavior = 'none';
    (body.style as any).touchAction = 'none';
    try { (body.style as any).webkitOverflowScrolling = 'auto'; } catch {}

    // ESC abfangen (externes Keyboard)
    const onKey = (e: KeyboardEvent)=>{ if(e.key === 'Escape'){ try { e.preventDefault(); } catch {} } };
    window.addEventListener('keydown', onKey, { capture:true } as any);
    return ()=>{
      removeAll();
      html.style.overscrollBehavior = prevHtml.overscrollBehavior;
      (html.style as any).touchAction = prevHtml.touchAction || '';
      body.style.overscrollBehavior = prevBody.overscrollBehavior;
      (body.style as any).touchAction = prevBody.touchAction || '';
      try { (body.style as any).webkitOverflowScrolling = prevBody.webkitOverflowScrolling || ''; } catch {}
      window.removeEventListener('keydown', onKey as any, { capture:true } as any);
    };
  },[enabled, opts?.edgeWidth, opts?.topEdgeHeight]);
}

export default useFullscreenTouchLock;