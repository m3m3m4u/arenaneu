"use client";
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

interface ReviewCourse { _id:string; title:string; description?:string; author?:string; category?:string; createdAt?:string; updatedAt?:string; reviewStatus?:string; isPublished?:boolean; }

export default function AdminCourseReviewPage(){
  const { data: session, status } = useSession();
  const role = (session?.user as any)?.role;
  const [loading,setLoading] = useState(false);
  const [pending,setPending] = useState<ReviewCourse[]>([]);
  const [rejected,setRejected] = useState<ReviewCourse[]>([]);
  const [error,setError] = useState('');

  async function load(){
    setLoading(true); setError('');
    try{
      const res = await fetch('/api/admin/courses/review');
      const d = await res.json();
      if(res.ok && d?.success){ setPending(d.pending||[]); setRejected(d.rejected||[]); } else setError(d.error||'Fehler beim Laden');
    } catch { setError('Netzwerkfehler'); } finally { setLoading(false); }
  }
  useEffect(()=>{ if(status==='authenticated' && role==='admin') load(); }, [status, role]);

  if(status==='loading') return <div className="p-6">Lade…</div>;
  if(role!=='admin') return <div className="p-6 text-sm text-red-600">Kein Zugriff</div>;

  return (
    <main className="max-w-7xl mx-auto p-6 space-y-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Kursprüfung</h1>
        <button onClick={load} disabled={loading} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50">{loading? '⏳' : 'Neu laden'}</button>
      </header>
      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded">{error}</div>}

      <section>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">Ausstehend <span className="text-xs font-normal bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{pending.length}</span></h2>
        {pending.length===0 && <div className="text-sm text-gray-500">Keine eingereichten Kurse.</div>}
        <div className="grid gap-4">
          {pending.map(c=> <CourseReviewCard key={c._id} c={c} onChange={load} />)}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Abgelehnt (letzte 20)</h2>
        {rejected.length===0 && <div className="text-sm text-gray-500">Keine abgelehnten Kurse.</div>}
        <div className="grid gap-4">
          {rejected.map(c=> <CourseReviewCard key={c._id} c={c} onChange={load} readOnly />)}
        </div>
      </section>
    </main>
  );
}

function CourseReviewCard({ c, onChange, readOnly }: { c: ReviewCourse; onChange:()=>void; readOnly?:boolean }){
  const [busy,setBusy] = useState(false);
  async function act(action:'approve'|'reject'){
    setBusy(true);
    try {
      const res = await fetch('/api/admin/courses/review', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action, courseId:c._id }) });
      if(!res.ok){ console.warn('Aktion fehlgeschlagen'); }
    } finally { setBusy(false); onChange(); }
  }
  return (
    <div className="bg-white border rounded-lg p-4 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 text-sm sm:text-base leading-snug break-words">{c.title}</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">Autor: {c.author||'?'}</p>
          {c.description && <p className="text-xs text-gray-600 mt-2 leading-snug line-clamp-3">{c.description}</p>}
          <div className="mt-2 flex flex-wrap gap-2 items-center">
            {c.category && <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-700 text-[11px] rounded-full">{c.category}</span>}
            <StatusBadge status={c.reviewStatus} published={c.isPublished} />
          </div>
        </div>
        {!readOnly && (
          <div className="flex flex-col gap-2 w-full md:w-44">
            <button onClick={()=>act('approve')} disabled={busy} className="bg-green-600 text-white px-3 py-1.5 rounded text-sm hover:bg-green-700 disabled:opacity-50">Freischalten</button>
            <button onClick={()=>act('reject')} disabled={busy} className="bg-red-600 text-white px-3 py-1.5 rounded text-sm hover:bg-red-700 disabled:opacity-50">Ablehnen</button>
            <a href={`/kurs/${c._id}`} className="text-center text-blue-600 text-xs hover:underline">Kurs ansehen</a>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status, published }:{ status?:string; published?:boolean }){
  if(published) return <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[11px] rounded-full">Veröffentlicht</span>;
  if(status==='pending') return <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[11px] rounded-full">Zur Prüfung</span>;
  if(status==='rejected') return <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[11px] rounded-full">Abgelehnt</span>;
  return <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-[11px] rounded-full">Entwurf</span>;
}
