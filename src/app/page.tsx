"use client";
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const res = await signIn('credentials', { redirect: false, username: form.username, password: form.password });
    setLoading(false);
    if(res?.error){
      setError('Login fehlgeschlagen');
    } else {
      router.push('/dashboard');
    }
  };

  return (
    <main className="min-h-screen w-full bg-gradient-to-br from-indigo-50 via-white to-blue-100 relative overflow-hidden flex flex-col">
      <div className="absolute inset-0 pointer-events-none [background:radial-gradient(circle_at_30%_20%,rgba(99,102,241,0.25),transparent_60%),radial-gradient(circle_at_70%_60%,rgba(59,130,246,0.25),transparent_55%)]" />
      <div className="relative flex-1 flex flex-col">
        {/* Hero */}
  <section className="px-6 pt-24 pb-20 md:pt-32 md:pb-28 max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center gap-14">
          <div className="flex-1">
            <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-4 bg-clip-text text-transparent bg-gradient-to-r from-indigo-700 via-indigo-500 to-blue-500 drop-shadow-sm">
              LernArena
            </h1>
            <span className="inline-block text-xs font-semibold tracking-wide uppercase bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full mb-5">Interaktive Lernplattform</span>
            <h2 className="text-3xl md:text-4xl font-bold leading-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-blue-600">Lernen. Üben. Spielen.<br className="hidden md:block"/> Motivation durch Gamification.</h2>
            <p className="mt-6 text-gray-600 max-w-2xl text-lg leading-relaxed">LernArena verbindet strukturierte Kurse, adaptive Übungen und spielerische Elemente zu einer fokussierten Lernumgebung für Schulen und Selbstlernende.</p>
            <ul className="mt-6 grid gap-3 text-sm text-gray-700 max-w-2xl">
              <li className="flex gap-2"><span className="text-indigo-500">✔</span> Kursfortschritt & Badges motivieren kontinuierliches Lernen</li>
              <li className="flex gap-2"><span className="text-indigo-500">✔</span> Lehrerwerkzeuge für Klassen, Auswertungen & Freigaben</li>
              <li className="flex gap-2"><span className="text-indigo-500">✔</span> Autorentools für schnelle Kurserstellung & Review-Workflow</li>
              <li className="flex gap-2"><span className="text-indigo-500">✔</span> Gastmodus zum schnellen Ausprobieren ohne Account</li>
            </ul>
            <div className="mt-8 flex flex-wrap gap-4">
              <a href="/register" className="px-6 py-3 rounded bg-white/70 backdrop-blur border border-indigo-200 text-indigo-700 font-semibold hover:bg-white shadow">Registrieren</a>
              <button onClick={()=>{ try { localStorage.setItem('guest:active','1'); } catch {}; window.location.href='/guest'; }} className="px-6 py-3 rounded bg-yellow-400 hover:bg-yellow-500 text-yellow-900 font-semibold shadow-inner">Als Gast testen</button>
            </div>
          </div>
          {/* Login Card */}
          <div id="login" className="w-full max-w-md bg-white/80 backdrop-blur rounded-2xl shadow-xl border border-indigo-100 p-7 self-stretch">
            <h2 className="text-xl font-semibold mb-4">Login</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <input name="username" value={form.username} onChange={handleChange} placeholder="Benutzername" className="w-full p-2 border rounded focus:outline-none focus:ring focus:ring-indigo-300" required autoComplete="username" />
              </div>
              <div>
                <input type="password" name="password" value={form.password} onChange={handleChange} placeholder="Passwort" className="w-full p-2 border rounded focus:outline-none focus:ring focus:ring-indigo-300" required autoComplete="current-password" />
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</p>}
              <button disabled={loading} className="w-full py-2.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-semibold disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                {loading && <span className="h-4 w-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />}
                <span>Einloggen</span>
              </button>
              <p className="text-xs text-gray-500 text-center">Noch keinen Account? <a className="text-indigo-600 hover:underline" href="/register">Registrieren</a></p>
            </form>
            <div className="mt-6 border-t pt-4 space-y-3">
              <button onClick={()=>{ try { localStorage.setItem('guest:active','1'); } catch {}; window.location.href = '/guest'; }} className="w-full py-2 rounded bg-yellow-400 hover:bg-yellow-500 text-yellow-900 font-semibold shadow-inner">Gastmodus</button>
              <p className="text-[11px] text-yellow-800 bg-yellow-50 border border-yellow-200 rounded p-2 leading-snug">Gast: Fortschritt nur lokal gespeichert.</p>
            </div>
          </div>
        </section>

        {/* Feature Grid */}
  <section className="px-6 pb-28 max-w-7xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { title: 'Individuelles Lernen', text: 'Klarer Fortschritt, flexible Einstiege – auch allein nutzbar.'},
              { title: 'Gamification', text: 'Badges, Punkte & visuelles Feedback steigern Motivation.'},
              { title: 'Lehrertools', text: 'Klassen organisieren, Freigaben steuern, Lernstände einsehen.'},
              { title: 'Autorentools', text: 'Fertige Kurse übernehmen, anpassen oder komplett neu erstellen.'},
              { title: 'Sofort Loslegen', text: 'Gastmodus ohne Registrierung zum schnellen Ausprobieren.'},
              { title: 'Datenschutz Fokus', text: 'Schlanke, transparente Datennutzung für Schulen.'},
            ].map(f => (
              <div key={f.title} className="p-5 rounded-lg bg-white/70 backdrop-blur border border-indigo-100 shadow-sm hover:shadow-md transition">
                <h3 className="font-semibold text-indigo-700 mb-2">{f.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{f.text}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
