"use client";
import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

export default function ResetPasswordConfirmPage(){
  return (
    <Suspense fallback={<div className="max-w-md mx-auto mt-10 text-sm text-gray-600">Lade…</div>}>
      <ResetPasswordInner />
    </Suspense>
  );
}

function ResetPasswordInner(){
  const sp = useSearchParams();
  const token = sp?.get('token') || '';
  const u = sp?.get('u') || '';
  const [pw,setPw]=useState('');
  const [pw2,setPw2]=useState('');
  const [status,setStatus]=useState<string|undefined>();
  const [loading,setLoading]=useState(false);
  const router=useRouter();
  async function submit(e:React.FormEvent){
    e.preventDefault(); setStatus(undefined); if(pw!==pw2){ setStatus('Passwörter unterscheiden sich'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/password-reset/confirm', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ token, userId:u, password: pw }) });
      const data = await res.json();
      if(data.ok){ setStatus('Erfolgreich gespeichert – weiterleiten…'); setTimeout(()=> router.push('/login'), 1200); }
      else setStatus(data.error||'Fehler');
    } catch { setStatus('Fehler'); } finally { setLoading(false); }
  }
  if(!token || !u){ return <div className="max-w-md mx-auto mt-10 bg-white p-6 rounded shadow text-sm">Ungültiger Link.</div>; }
  return (
    <div className="max-w-md mx-auto mt-8 bg-white p-6 rounded shadow">
      <h1 className="text-xl font-bold mb-4">Neues Passwort setzen</h1>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Neues Passwort</label>
          <input type="password" value={pw} onChange={e=>setPw(e.target.value)} className="w-full border rounded px-3 py-2" required minLength={6} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Wiederholen</label>
          <input type="password" value={pw2} onChange={e=>setPw2(e.target.value)} className="w-full border rounded px-3 py-2" required minLength={6} />
        </div>
        <button disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 rounded font-semibold">Speichern</button>
      </form>
      {status && <p className="mt-4 text-sm text-gray-700">{status}</p>}
      <p className="mt-6 text-xs text-gray-500">Token ist 30 Minuten gültig.</p>
    </div>
  );
}

