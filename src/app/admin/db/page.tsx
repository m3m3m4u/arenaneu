"use client";
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface DbStats {
  readyState?: number;
  connectionCount?: number;
  activeConnections?: Array<{ idx:number; rs:number }>;
  serverPools?: Array<{ address:string; maxPool?:number; generation?:number; backlog?:number }>;
  sessions?: { size?: number; borrowed?: number };
  metrics?: any;
  error?: string;
}

const STATE_LABEL: Record<number,string> = { 0:'disconnected', 1:'connected', 2:'connecting', 3:'disconnecting' };

export default function AdminDbMonitorPage(){
  const { data: session, status } = useSession();
  const role = (session?.user as any)?.role;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [stats, setStats] = useState<DbStats|undefined>();
  const [history, setHistory] = useState<Array<{ t:number; c:number }>>([]);
  const [killing, setKilling] = useState(false);
  const [killResult, setKillResult] = useState<any>(null);
  const [watchdogLoading, setWatchdogLoading] = useState(false);
  const [watchdogResult, setWatchdogResult] = useState<any>(null);
  const timerRef = useRef<NodeJS.Timeout|undefined>(undefined);
  const intervalMs = 5000;

  const load = useCallback(async ()=>{
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/debug/db-stats', { cache:'no-store' });
      const data = await res.json();
      if(!res.ok || !data?.success){ throw new Error(data?.error || 'Fehler'); }
      const db: DbStats = data.db || {};
      setStats(db);
      if(typeof db.connectionCount === 'number'){
        setHistory(h=>{
          const next = [...h, { t: Date.now(), c: db.connectionCount! }];
          // Nur letzte 60 Einträge (~5 Minuten) behalten
            return next.slice(-60);
        });
      }
    } catch(e:any){ setError(e?.message || String(e)); }
    finally { setLoading(false); }
  },[]);

  useEffect(()=>{ if(status==='authenticated' && role==='admin'){ load(); timerRef.current = setInterval(load, intervalMs); return ()=>{ if(timerRef.current) clearInterval(timerRef.current); }; } },[status, role, load]);

  if(status==='loading') return <div className="p-6">Lade…</div>;
  if(role!=='admin') return <div className="p-6 text-sm text-red-600">Kein Zugriff</div>;

  const warnThreshold = parseInt(process.env.NEXT_PUBLIC_DB_CONN_WARN_THRESHOLD || '5', 10);
  const hardLimit = parseInt(process.env.NEXT_PUBLIC_DB_CONN_HARD_LIMIT || '15', 10);
  const connCount = stats?.connectionCount ?? 0;
  const stateLabel = (n:number|undefined)=> (n!==undefined? STATE_LABEL[n] || String(n): '?');

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">DB Monitoring</h1>
          <p className="text-xs text-gray-500 mt-1">Live-Überwachung von Mongoose / Mongo Verbindungen und Pool-Metriken (Poll {intervalMs/1000}s)</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} disabled={loading} className="px-3 py-1.5 rounded text-sm bg-blue-600 text-white disabled:opacity-50">{loading? 'Aktualisiere…':'Neu laden'}</button>
          <KillButton onKill={async ()=>{
            setKilling(true); setKillResult(null);
            try {
              const res = await fetch('/api/admin/db/kill-connections?confirm=1', { method:'POST' });
              const data = await res.json().catch(()=>({}));
              setKillResult({ ok: res.ok, data });
              // Nach kurzer Verzögerung neu laden
              setTimeout(()=> load(), 800);
            } catch(e:any){ setKillResult({ ok:false, error:String(e?.message||e) }); }
            finally { setKilling(false); }
          }} killing={killing} />
          <button onClick={async ()=>{
            setWatchdogLoading(true); setWatchdogResult(null);
            try {
              const res = await fetch('/api/admin/db/watchdog?heal=1', { cache:'no-store' });
              const data = await res.json().catch(()=>({}));
              setWatchdogResult({ ok: res.ok, data });
              setTimeout(()=> load(), 800);
            } catch(e:any){ setWatchdogResult({ ok:false, error:String(e?.message||e) }); }
            finally { setWatchdogLoading(false); }
          }} disabled={watchdogLoading} className="px-3 py-1.5 rounded text-sm bg-amber-600 text-white disabled:opacity-50 hover:bg-amber-700">{watchdogLoading? 'Heile…':'Watchdog Heal'}</button>
        </div>
      </header>
      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded">{error}</div>}
      {killResult && (
        <div className={`p-3 text-xs rounded border ${killResult.ok? 'bg-green-50 border-green-200 text-green-700':'bg-red-50 border-red-200 text-red-700'}`}>
          <div className="font-semibold mb-1">Kill-Ergebnis</div>
          <pre className="whitespace-pre-wrap break-all max-h-48 overflow-auto">{JSON.stringify(killResult.data||killResult.error, null, 2)}</pre>
        </div>
      )}
      {watchdogResult && (
        <div className={`p-3 text-xs rounded border ${watchdogResult.ok? 'bg-amber-50 border-amber-200 text-amber-700':'bg-red-50 border-red-200 text-red-700'}`}>
          <div className="font-semibold mb-1">Watchdog</div>
          <pre className="whitespace-pre-wrap break-all max-h-48 overflow-auto">{JSON.stringify(watchdogResult.data||watchdogResult.error, null, 2)}</pre>
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Status" value={stateLabel(stats?.readyState)} />
        <StatCard label="Connections" value={String(connCount)} accent={connCount>hardLimit? 'red': connCount>=warnThreshold? 'amber': 'gray'} />
        <StatCard label="Sessions" value={String(stats?.sessions?.size ?? 0)} />
        <StatCard label="Reconnects" value={String(stats?.metrics?.reconnects ?? 0)} />
      </section>

      <section className="bg-white border rounded p-4 space-y-4">
        <h2 className="font-semibold text-sm">Verlauf (Connections)</h2>
        <ConnectionSparkline data={history} warn={warnThreshold} hard={hardLimit} />
        <div className="text-[10px] text-gray-500">Max: {Math.max(0,...history.map(h=>h.c))}</div>
      </section>

      <section className="bg-white border rounded p-4 space-y-3">
        <h2 className="font-semibold text-sm">Aktive Connections</h2>
        {!stats?.activeConnections?.length && <div className="text-xs text-gray-500">Keine Daten</div>}
        <ul className="text-xs divide-y">
          {stats?.activeConnections?.map(c=>{
            const color = c.rs===1? 'text-green-600': c.rs===2? 'text-amber-600': c.rs===3? 'text-gray-500':'text-red-600';
            return <li key={c.idx} className="py-1 flex justify-between"><span>#{c.idx}</span><span className={color}>{stateLabel(c.rs)}</span></li>;
          })}
        </ul>
      </section>

      <section className="bg-white border rounded p-4 space-y-3">
        <h2 className="font-semibold text-sm">Server-Pools</h2>
        {!stats?.serverPools?.length && <div className="text-xs text-gray-500">Keine Daten</div>}
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead><tr className="text-left border-b"><th className="py-1 pr-4">Adresse</th><th className="py-1 pr-4">maxPool</th><th className="py-1 pr-4">Generation</th><th className="py-1 pr-4">Backlog</th></tr></thead>
            <tbody>
              {stats?.serverPools?.map((p,i)=> <tr key={i} className="border-b last:border-b-0"><td className="py-1 pr-4 font-mono">{p.address}</td><td className="py-1 pr-4">{p.maxPool ?? '-'}</td><td className="py-1 pr-4">{p.generation ?? '-'}</td><td className="py-1 pr-4">{p.backlog ?? '-'}</td></tr>)}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white border rounded p-4 space-y-3">
        <h2 className="font-semibold text-sm">Metriken</h2>
        {!stats?.metrics && <div className="text-xs text-gray-500">Keine Metriken geladen</div>}
        {stats?.metrics && (
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 text-xs">
            {Object.entries(stats.metrics).map(([k,v])=> <div key={k} className="flex justify-between bg-gray-50 rounded px-2 py-1"><span className="text-gray-500">{k}</span><span className="font-mono">{String(v)}</span></div>)}
          </div>
        )}
      </section>

      <footer className="text-[10px] text-gray-400 pt-4">Warnschwelle: {warnThreshold} • Hard Limit: {hardLimit} • Aktualisierung alle {intervalMs/1000}s</footer>
    </main>
  );
}

function StatCard({ label, value, accent='gray' }: { label:string; value:string; accent?:'gray'|'amber'|'red'|'green' }){
  const colorMap: Record<string,string> = {
    gray:'bg-gray-100 text-gray-700',
    amber:'bg-amber-100 text-amber-700',
    red:'bg-red-100 text-red-700',
    green:'bg-green-100 text-green-700'
  };
  return <div className="flex flex-col gap-1 bg-white border rounded p-3 shadow-sm">
    <span className="text-[11px] uppercase tracking-wide text-gray-500">{label}</span>
    <span className={`text-lg font-semibold inline-block px-2 py-0.5 rounded ${colorMap[accent]}`}>{value}</span>
  </div>;
}

function ConnectionSparkline({ data, warn, hard }: { data:Array<{t:number;c:number}>; warn:number; hard:number }){
  if(!data.length) return <div className="text-xs text-gray-500">Noch keine Daten</div>;
  const max = Math.max(hard, ...data.map(d=>d.c));
  const points = data.map((d,i)=>{
    const x = (i/(data.length-1))*100;
    const y = 100 - (d.c / (max || 1))*100;
    return `${x},${y}`;
  }).join(' ');
  const last = data[data.length-1];
  return (
    <div className="w-full h-24 relative">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
        {/* Warn / Hard Linien */}
        <line x1="0" x2="100" y1={100-(warn/(max||1))*100} y2={100-(warn/(max||1))*100} stroke="#f59e0b" strokeDasharray="2 3" strokeWidth={0.6} />
        <line x1="0" x2="100" y1={100-(hard/(max||1))*100} y2={100-(hard/(max||1))*100} stroke="#dc2626" strokeDasharray="3 4" strokeWidth={0.8} />
        <polyline fill="none" stroke="#2563eb" strokeWidth={1.2} points={points} />
        {/* Fläche */}
        <polyline fill="url(#grad)" stroke="none" points={`0,100 ${points} 100,100`} />
        <defs>
          <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute bottom-0 right-0 text-[10px] text-gray-500 pr-1 pb-0.5">aktuell {last.c}</div>
    </div>
  );
}

function KillButton({ onKill, killing }: { onKill: ()=>void|Promise<void>; killing:boolean }){
  return <button onClick={()=>onKill()} disabled={killing} className="px-3 py-1.5 rounded text-sm bg-red-600 text-white disabled:opacity-50 hover:bg-red-700">{killing? 'Beende…':'Verbindungen beenden'}</button>;
}
