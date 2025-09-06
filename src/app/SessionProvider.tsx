"use client";
import { SessionProvider } from "next-auth/react";
import { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useToast } from '@/components/shared/ToastProvider';

function InvalidationWatcher(){
  const { data: session } = useSession();
  let toastFn: ((o:{message:string; title?:string; kind?:any})=>void) | null = null;
  try {
    // useToast nur im Browser mit Provider gültig
    const { toast } = useToast();
    toastFn = toast;
  } catch {
    // außerhalb des Providers (SSR / not-found prerender) einfach nichts tun
  }
  const [fired,setFired]=useState(false);
  useEffect(()=>{
    if ((session as any)?.invalidated && !fired) {
      setFired(true);
      let remaining = 6; // Sekunden
      toastFn?.({ kind:'info', title:'Sicherheit', message:'Passwort geändert – Sitzung wird beendet in '+remaining+'s' } as any);
      const interval = setInterval(()=>{
        remaining -=1;
        if(remaining>0){
          toastFn?.({ kind:'info', message:'Sitzung läuft noch '+remaining+'s …' } as any);
        } else {
          clearInterval(interval);
          signOut({ callbackUrl: '/login', redirect: true });
        }
      },1000);
      return ()=> clearInterval(interval);
    }
  }, [session, fired, toastFn]);
  return null;
}

function LocalSessionSync(){
  const { data: session, status } = useSession();
  useEffect(()=>{
    try {
      const username = session?.user && (session.user as any).username;
      if (status === 'authenticated' && username) {
        localStorage.setItem('session:username', String(username));
      } else if (status === 'unauthenticated') {
        localStorage.removeItem('session:username');
      }
    } catch {}
  }, [status, session?.user]);
  return null;
}

export default function CustomSessionProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider><InvalidationWatcher /><LocalSessionSync />{children}</SessionProvider>;
}
