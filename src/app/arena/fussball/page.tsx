"use client";
import Link from 'next/link';

// Neue zentrale Lobby / Matchmaking Seite (die frühere Einzelspieler-Demo ist jetzt unter /arena/fussball-solo)
export default function FussballLobbyLanding(){
  return (
    <main className="max-w-4xl mx-auto p-6 flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2">⚽ Fußball Arena</h1>
        <p className="text-sm text-gray-600">Erstelle oder tritt Lobbys bei, sobald zwei Spieler bereit sind startet das Match (Prototyp). Einzelspieler-Testball findest du weiterhin separat.</p>
        <div className="flex gap-3 flex-wrap text-xs">
          <Link href="/arena/fussball2" className="px-3 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-700">Zu den Lobbys</Link>
          <Link href="/arena/fussball-solo" className="px-3 py-1.5 rounded bg-gray-200 hover:bg-gray-300 text-gray-800">Solo-Prototyp</Link>
        </div>
      </header>
      <section className="rounded border bg-white shadow p-4">
        <h2 className="font-semibold mb-2 text-lg">Status</h2>
        <ul className="text-sm list-disc ml-5 space-y-1">
          <li>Lobby-Erstellung & Join (Page: /arena/fussball2)</li>
          <li>Ready-Status & automatischer Redirect zum Spielplatzhalter</li>
          <li>Platzhalter Live-Seite unter /arena/fussball-live/[id]</li>
          <li>Einzelspieler Physik-Demo ausgelagert (/arena/fussball-solo)</li>
        </ul>
        <div className="mt-4 text-xs text-gray-500">Nächste Schritte: Realtime Sync (WebSocket), Spieler-Avatare, Ball-Server-Authorität, Punkte & Timer.</div>
      </section>
    </main>
  );
}
