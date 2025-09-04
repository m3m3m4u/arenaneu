"use client";
import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function FussballLivePage(){
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  useEffect(()=>{
    // Placeholder: später WebSocket/SSE Setup
  },[id]);

  return (
    <main className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">⚽ Fußball Spiel (Platzhalter)</h1>
      <p className="text-sm text-gray-600 mb-4">Lobby ID: <span className="font-mono">{id}</span></p>
      <div className="p-6 border rounded bg-white text-gray-500 text-sm">
        Hier kommt später das Spielfeld / Canvas / Echtzeit Logik hin.
      </div>
      <div className="mt-6"><a href="/arena/fussball2" className="text-blue-600 hover:underline">← Zurück zur Lobby</a></div>
    </main>
  );
}
