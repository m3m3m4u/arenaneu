"use client";
import { useState } from 'react';

export default function ForgotPasswordPage(){
  const [identifier,setIdentifier]=useState('');
  const [status,setStatus]=useState<string|undefined>();
  const [devLink,setDevLink]=useState<string|undefined>();
  const [loading,setLoading]=useState(false);
  async function submit(e:React.FormEvent){
    e.preventDefault(); setStatus(undefined); setDevLink(undefined); setLoading(true);
    try {
  const res = await fetch('/api/auth/password-reset/request', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ identifier }) });
      const data = await res.json();
      if(data.ok){ setStatus('Falls die Adresse existiert, wurde ein Link gesendet.'); if(data.resetLink) setDevLink(data.resetLink); }
      else setStatus(data.error||'Fehler');
    } catch { setStatus('Fehler'); } finally { setLoading(false); }
  }
  return (
    <div className="max-w-md mx-auto mt-8 bg-white p-6 rounded shadow">
      <h1 className="text-xl font-bold mb-4">Passwort zurücksetzen</h1>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">E-Mail oder Benutzername</label>
          <input required value={identifier} onChange={e=>setIdentifier(e.target.value)} className="w-full border rounded px-3 py-2" placeholder="name oder name@mail.de" />
        </div>
        <button disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 rounded font-semibold">Link anfordern</button>
      </form>
      {status && <p className="mt-4 text-sm text-gray-700">{status}</p>}
      {devLink && <p className="mt-3 break-all text-xs text-gray-500">Dev-Link: <a className="underline" href={devLink}>{devLink}</a></p>}
  <p className="mt-6 text-xs text-gray-500">Hinweis: E-Mail ist optional. Wenn keine E-Mail hinterlegt ist, erscheint im Dev-Modus ein Direkt-Link, sonst erfolgt Versand (zukünftig).</p>
    </div>
  );
}
