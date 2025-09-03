"use client";
import { SessionProvider } from "next-auth/react";
import { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useToast } from '@/components/shared/ToastProvider';

function InvalidationWatcher(){
  const { data: session } = useSession();
  const { toast } = useToast();
  const [fired,setFired]=useState(false);
  useEffect(()=>{
    if ((session as any)?.invalidated && !fired) {
      setFired(true);
      let remaining = 6; // Sekunden
      toast({ kind:'info', title:'Sicherheit', message:'Passwort geändert – Sitzung wird beendet in '+remaining+'s' });
      const interval = setInterval(()=>{
        remaining -=1;
        if(remaining>0){
          toast({ kind:'info', message:'Sitzung läuft noch '+remaining+'s …' });
        } else {
          clearInterval(interval);
          signOut({ callbackUrl: '/login', redirect: true });
        }
      },1000);
      return ()=> clearInterval(interval);
    }
  }, [session, toast, fired]);
  return null;
}

export default function CustomSessionProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider><InvalidationWatcher />{children}</SessionProvider>;
}
