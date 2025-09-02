"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface DashboardUser {
  username: string;
  name?: string;
  stars?: number;
  completedLessons: string[];
  role?: string;
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [user, setUser] = useState<DashboardUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unread, setUnread] = useState<number>(0);
  const [lastLink, setLastLink] = useState<{ courseId?: string; lessonId?: string } | null>(null);
  // Buttons aus public/media/buttons (via /api/buttons)
  type BtnItem = { src: string; name: string; href?: string; downSrc?: string; upSrc?: string };
  const [buttons, setButtons] = useState<BtnItem[]>([]);

  useEffect(() => {
    const mapHref = (name: string): string | undefined => {
      const k = name.toLowerCase();
      if (k.includes('autor')) return '/autor';
      if (k.includes('teacher') || k.includes('lehrer')) return '/teacher';
      if (k.includes('lern') || k.includes('kurs')) return '/lernen';
      if (k.includes('ueb') || k.includes('übung') || k.includes('uebung')) return '/ueben';
  if (k.includes('arena')) return '/arena';
      if (k.includes('medien')) return '/autor?tab=medien';
  if (k.includes('dashboard')) return '/dashboard';
  if (k.includes('nachricht') || k.includes('message')) return '/messages';
      if (k.includes('admin')) return '/admin/users';
      if (k.includes('gast') || k.includes('guest')) return '/guest';
      return undefined;
    };
    (async () => {
      try {
        const res = await fetch('/api/buttons', { cache: 'no-store' });
        const d = await res.json();
        if (res.ok && d?.items) {
          const role = (session?.user as any)?.role;
          const raw = d.items.map((it: any) => ({ ...it, href: mapHref(it.name) }));
          const filtered = raw.filter((btn: any) => {
            const h = btn.href;
            if (!h) return false; // ohne Ziel nicht anzeigen
            // Lernende: nur lernen, üben, arena, dashboard, messages, guest
            if (role === 'learner') {
              return ['/lernen','/ueben','/arena','/dashboard','/guest','/messages'].some(p=>h.startsWith(p));
            }
            // Teacher: keine Autor- oder Admin-Bereiche anzeigen
            if (role === 'teacher') {
              if (h.startsWith('/admin') || h.startsWith('/autor')) return false;
              return true;
            }
            // Pending-Author wie learner behandeln (pending-teacher existiert nicht mehr)
            if (role === 'pending-author') {
              return ['/lernen','/ueben','/arena','/dashboard','/guest','/messages'].some(p=>h.startsWith(p));
            }
            // Default (admin, author etc.): alles lassen
            return true;
          });
          setButtons(filtered);
        } else {
          setButtons([]);
        }
      } catch {
        setButtons([]);
      }
    })();
  }, [session?.user]);

  useEffect(() => {
    const fetchOverview = async () => {
      if(!session?.user?.username) return;
      try {
        setLoadingUser(true);
        const res = await fetch('/api/dashboard/overview');
        if (res.status === 401) return; // redirect handled elsewhere
        const data = await res.json();
        if(res.ok && data.success){
          setUser(data.user as DashboardUser);
          if(typeof data.unreadCount === 'number') setUnread(data.unreadCount);
          setError(null);
        } else {
          // Fallback: alter Weg, falls Endpoint nicht liefert
          const res2 = await fetch("/api/user?username=" + encodeURIComponent(session.user.username));
          const data2 = await res2.json();
          if (res2.ok && data2.user) { setUser(data2.user as DashboardUser); }
          else setError(data.error || data2.error || 'Fehler beim Laden');
        }
      } catch {
        setError('Netzwerkfehler');
      } finally { setLoadingUser(false); }
    };
    void fetchOverview();
  }, [session?.user?.username]);

  // Letzte Aktivität (aus localStorage)
  useEffect(() => {
    try {
      const courseId = localStorage.getItem('last:courseId') || undefined;
      const lessonId = localStorage.getItem('last:lessonId') || undefined;
      if (courseId && lessonId) setLastLink({ courseId, lessonId });
      else if (courseId) setLastLink({ courseId });
    } catch { /* ignore */ }
  }, []);

  // Ungelesene Nachrichten (eingehend) zählen und anzeigen
  useEffect(() => {
  let timer: any;
  let hidden = false;
  function visibilityHandler(){ hidden = document.hidden; }
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', visibilityHandler);
    async function loadUnread(){
      try{
        const res = await fetch('/api/messages/unread');
        const d = await res.json();
        if(res.ok && d.success) setUnread(d.count||0); else setUnread(0);
      } catch { /* ignore */ }
    }
    const r = (session?.user as any)?.role;
    const allowed = r==='teacher' || (r==='learner' && (user as any)?.ownerTeacher);
      if(status==='authenticated' && allowed){
        // Poll erst nach initialem Overview (unread evtl. schon gesetzt)
  const base = Number(process.env.NEXT_PUBLIC_UNREAD_POLL_MS||'60000');
  const intervalMs = Math.max(120000, base);
  // Zufälliger Start-Offset (0..intervalMs*0.3) verteilt erste Abfragen, verhindert thundering herd
  const jitter = Math.floor(Math.random()*intervalMs*0.3);
  setTimeout(()=>{ if(!hidden) void loadUnread(); }, 500 + jitter);
  timer = setInterval(()=>{ if(!hidden) void loadUnread(); }, intervalMs + Math.floor(Math.random()*intervalMs*0.1));
      }
      return () => { if(timer) clearInterval(timer); if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', visibilityHandler); };
  }, [status, (session?.user as any)?.role, (user as any)?.ownerTeacher]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  if (status === 'loading') {
    return <div className="text-center mt-10">Lade...</div>;
  }
  if (status === 'unauthenticated') {
    return null; // Redirect läuft in useEffect
  }

  return (
  <main className="max-w-6xl mx-auto mt-6 sm:mt-10 p-4 sm:p-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profil-Spalte */}
  <section className="bg-white rounded shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">Dein Profil</h2>
            <button onClick={() => signOut({ callbackUrl: '/login', redirect: true })} className="bg-red-600 text-white py-2 px-4 rounded text-sm hover:bg-red-700">Logout</button>
          </div>
          {error && <div className="text-red-600 text-sm mb-4">{error}</div>}
          {loadingUser && !user ? (
            <div>Lade Nutzerdaten...</div>
          ) : user ? (
            <div className="space-y-2">
              <div><strong>Benutzername:</strong> {user.username}</div>
              <div><strong>Name:</strong> {user.name || '—'}</div>
              <div><strong>⭐ Sterne:</strong> {user.stars ?? 0}</div>
              <div><strong>Rolle:</strong> {(session?.user as any)?.role}</div>
              <div className="flex items-center gap-2 flex-wrap">
                <strong>Abgeschlossene Lektionen:</strong>
                <span>{user.completedLessons?.length ?? 0}</span>
              </div>
              {(session?.user as any)?.role === 'pending-author' && (
                <div className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-300 rounded p-2">Dein Autor-Zugang wartet auf Freischaltung.</div>
              )}
              {(!(session?.user as any)?.role || (session?.user as any)?.role==='learner') && (
                <AutorWerden />
              )}
              {/* Nachrichten Link mit Unread-Badge */}
              {((session?.user as any)?.role && (session?.user as any)?.role!=='guest') && (
                <MessagesLink unread={typeof unread==='number'? unread: 0} />
              )}
            </div>
          ) : (
            <div>Keine Nutzerdaten vorhanden.</div>
          )}

          {/* Zuletzt weitergemacht */}
          <div className="mt-6 border-t pt-4">
            <h3 className="font-semibold mb-2">Zuletzt weitergemacht</h3>
            {lastLink?.courseId ? (
              <div className="text-sm">
                {lastLink.lessonId ? (
                  <a href={`/kurs/${lastLink.courseId}/lektion/${lastLink.lessonId}`} className="text-blue-600 hover:underline">
                    Weiter zur letzten Lektion
                  </a>
                ) : (
                  <a href={`/kurs/${lastLink.courseId}`} className="text-blue-600 hover:underline">
                    Zur letzten Kursseite
                  </a>
                )}
              </div>
            ) : (
              <div className="text-sm text-gray-500">Noch keine Aktivität erfasst.</div>
            )}
          </div>
        </section>

        {/* Kachel-Spalte */}
        <section className="bg-white rounded shadow p-6">
          <h2 className="text-2xl font-bold mb-4">Schnellzugriff</h2>
          {buttons.length === 0 ? (
            <div className="text-sm text-gray-500">Keine Buttons gefunden (public/media/buttons).</div>
          ) : (
            <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
              {buttons.map((b) => {
                const defaultSrc = b.downSrc || b.src;
                const hoverSrc = b.upSrc || b.src;
                return (
                  <li key={b.src}>
                    {b.href ? (
                      <a href={b.href} className="block group">
                        <span className="relative block">
                          <Image src={defaultSrc} alt={b.name} width={640} height={240} className="w-full h-auto object-contain group-hover:opacity-0 transition-opacity duration-150" />
                          <Image src={hoverSrc} alt={b.name} width={640} height={240} className="w-full h-auto object-contain absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150" />
                        </span>
                      </a>
                    ) : (
                      <span className="relative block group">
                        <Image src={defaultSrc} alt={b.name} width={640} height={240} className="w-full h-auto object-contain group-hover:opacity-0 transition-opacity duration-150" />
                        <Image src={hoverSrc} alt={b.name} width={640} height={240} className="w-full h-auto object-contain absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150" />
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function AutorWerden(){
  const [requested,setRequested] = useState(false);
  const [busy,setBusy]=useState(false);
  async function request(){
    setBusy(true);
    try{
      const res = await fetch('/api/user/request-author',{ method:'POST'});
      if(res.ok){ setRequested(true); }
    } finally { setBusy(false); }
  }
  if(requested) return <div className="text-xs text-green-700 bg-green-50 border border-green-300 rounded p-2 mt-2">Anfrage gesendet. Du erscheinst nun als pending-author.</div>;
  return <button disabled={busy} onClick={request} className="mt-3 text-xs px-3 py-1 border rounded bg-white hover:bg-gray-50 disabled:opacity-50">Autor werden (Anfrage)</button>;
}

function MessagesLink({ unread }: { unread:number }){
  const badge = <span className={`inline-flex items-center justify-center text-[10px] leading-none px-1.5 py-0.5 rounded-full font-medium ${unread>0? 'bg-red-600 text-white':'bg-gray-200 text-gray-600'}`}>{unread>99?'99+':unread}</span>;
  return <a href="/messages" className="inline-flex items-center gap-1 text-xs px-2 py-1 border rounded bg-white hover:bg-gray-50">
    <span>Nachrichten</span>
    {badge}
  </a>;
}
