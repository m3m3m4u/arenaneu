"use client";
import { useSession } from 'next-auth/react';
import AdminNav from '@/components/admin/AdminNav';
import { useEffect, useState } from 'react';

export default function AdminHomePage(){
  const { data: session, status } = useSession();
  const role = (session?.user as any)?.role;
  const [dbStats, setDbStats] = useState<any>(null);
  const [dbErr, setDbErr] = useState<string>('');
  const [loadingDb, setLoadingDb] = useState(false);

  useEffect(()=>{
    if(role!=="admin") return;
    let t: any;
    async function load(){
      setLoadingDb(true); setDbErr('');
      try {
        const r = await fetch('/api/debug/db-stats', { cache:'no-store' });
        const d = await r.json();
        if(r.ok && d?.success){ setDbStats(d.db); } else setDbErr(d?.error||'Fehler');
      } catch(e:any){ setDbErr(String(e?.message||e)); }
      finally { setLoadingDb(false); }
    }
    load();
    t = setInterval(load, 10000); // alle 10s
    return ()=>{ if(t) clearInterval(t); };
  }, [role]);
  if(status==='loading') return <div className="p-6">Lade…</div>;
  if(role!=='admin') return <div className="p-6 text-sm text-red-600">Kein Zugriff</div>;
  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <AdminNav />
      <h1 className="text-2xl font-bold">Admin Bereich</h1>
      <p className="text-sm text-gray-600">Wähle eine Funktion in der Navigation. Neue Features:</p>
      <ul className="list-disc pl-5 text-sm space-y-1">
        <li>DB Monitoring mit Live-Verbindungsanzeige</li>
        <li>Nachrichten: Admin kann Lernende oder Lehrer direkt adressieren</li>
      </ul>
      <section className="mt-8 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">DB Kurzmonitor</h2>
          <button onClick={()=>{ setDbStats(null); setTimeout(()=>{ /* trigger reload via effect by manual fetch */ fetch('/api/debug/db-stats',{cache:'no-store'}).then(r=>r.json()).then(d=>{ if(d?.success) setDbStats(d.db); }); }, 50); }} className="text-xs px-3 py-1.5 rounded border bg-white hover:bg-gray-50">↻ Aktualisieren</button>
        </div>
        {dbErr && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{dbErr}</div>}
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          <MiniStat label="Status" value={stateLabel(dbStats?.readyState)} />
          <MiniStat label="Connections" value={String(dbStats?.connectionCount ?? '?')} accent={accentForConn(dbStats?.connectionCount)} />
          <MiniStat label="Reconnects" value={String(dbStats?.metrics?.reconnects ?? 0)} />
          <MiniStat label="Fehler" value={String(dbStats?.metrics?.errors ?? 0)} accent={(dbStats?.metrics?.errors||0)>0? 'amber':'gray'} />
          <MiniStat label="Self-Heals" value={String(dbStats?.metrics?.selfHeals ?? 0)} accent={(dbStats?.metrics?.selfHeals||0)>0? 'green':'gray'} />
          <MiniStat label="Max Observed" value={String(dbStats?.metrics?.maxObservedConnections ?? '-')} />
          <MiniStat label="Letzter Disconnect" value={timeAgo(dbStats?.metrics?.lastDisconnectAt)} />
          <MiniStat label="Letzte Fehlermeldung" value={truncate(dbStats?.metrics?.lastError)} tooltip={dbStats?.metrics?.lastError} />
        </div>
        <p className="text-[10px] text-gray-500">Detailansicht & Aktionen (Heal / Kill / Events) unter <a href="/admin/db" className="underline">DB Monitoring</a>. Auto-Refresh alle 10s.</p>
      </section>
    </main>
  );
}

function stateLabel(n:number|undefined){
  if(n===0) return 'disconnected'; if(n===1) return 'connected'; if(n===2) return 'connecting'; if(n===3) return 'disconnecting'; return '?';
}
function accentForConn(c:number|undefined){
  if(typeof c !== 'number') return 'gray';
  const warn = parseInt(process.env.NEXT_PUBLIC_DB_CONN_WARN_THRESHOLD || '5', 10);
  const hard = parseInt(process.env.NEXT_PUBLIC_DB_CONN_HARD_LIMIT || '15', 10);
  if(c>hard) return 'red'; if(c>=warn) return 'amber'; return 'gray';
}
function timeAgo(ts:number|undefined){ if(!ts) return '-'; const diff = Date.now()-ts; const s=Math.floor(diff/1000); if(s<60) return s+'s'; const m=Math.floor(s/60); if(m<60) return m+'m'; const h=Math.floor(m/60); return h+'h'; }
function truncate(v:any){ if(!v) return '-'; const s=String(v); return s.length>20? s.slice(0,20)+'…': s; }
function MiniStat({ label, value, accent='gray', tooltip }: { label:string; value:string; accent?:'gray'|'amber'|'red'|'green'; tooltip?:string }){
  const color: Record<string,string> = { gray:'bg-gray-100 text-gray-700', amber:'bg-amber-100 text-amber-700', red:'bg-red-100 text-red-700', green:'bg-green-100 text-green-700' };
  return <div className="flex flex-col gap-1 bg-white border rounded p-3 shadow-sm" title={tooltip||value}><span className="text-[10px] tracking-wide uppercase text-gray-500">{label}</span><span className={`text-sm font-semibold inline-block px-2 py-0.5 rounded ${color[accent]}`}>{value}</span></div>;
}
