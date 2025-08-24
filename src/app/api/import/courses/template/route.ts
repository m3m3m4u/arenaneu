import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import * as XLSX from 'xlsx';

function buildTemplate(): Buffer {
  // Zeilenbasiertes Template: jede physische Excel-Zeile ist eine logische Zeile.
  // Ab Zeile 3: Folge von Lektionen; neue Lektion startet mit Typ-Zeile (VIDEO:, MD:, SC:, MC:, MATCHING:, ORDERING:, LUECKENTEXT:, TEXT-ANSWER: ...)
  // SC/MC: Zeile (Typ optional), dann Lektionstitel, dann Frageblöcke: Frage + Antworten (mit * für korrekt), Leerzeile trennt Blöcke.
  const col1: string[] = [];
  col1.push('VIDEO:');
  col1.push('Einführungskurs');
  col1.push('https://youtu.be/VIDEO_ID');
  col1.push('**Markdown** Beschreibung zum Video (Zeile 1)');
  col1.push('Weitere Infos (Zeile 2)');
  col1.push('MD:');
  col1.push('Willkommenstext');
  col1.push('Dies ist **Markdown** Inhalt.');
  col1.push('Noch ein Absatz.');
  col1.push('SC:');
  col1.push('Grundrechenarten Einstieg');
  col1.push('Was ist 2 + 2?');
  col1.push('*4');
  col1.push('3');
  col1.push('5');
  col1.push('');
  col1.push('Was ist 3 + 6?');
  col1.push('*9');
  col1.push('8');
  col1.push('10');
  col1.push('MATCHING:');
  col1.push('Einfache Zuordnung');
  col1.push('Hund|Tier');
  col1.push('Rose|Blume');
  col1.push('Auto|Fahrzeug');
  col1.push('ORDERING:');
  col1.push('Sortiere klein -> groß');
  col1.push('Ameise');
  col1.push('Katze');
  col1.push('Pferd');
  col1.push('Elefant');
  col1.push('LUECKENTEXT:');
  col1.push('Physik Grundlagen');
  col1.push('Die *Masse* wird in *Kilogramm* gemessen und die *Zeit* in *Sekunden*.');
  col1.push('TEXT-ANSWER:');
  col1.push('Freitext Reflexion');
  col1.push('Beschreibe das Wasserkreislauf-Prinzip in 2-3 Sätzen.');
  col1.push('MINIGAME:');
  col1.push('Reaktionsspiel');
  col1.push('difficulty=easy');
  col1.push('duration=30');

  const col2: string[] = [];
  col2.push('VIDEO:');
  col2.push('Kapitel 1 Einführung');
  col2.push('https://example.com/video.mp4');
  col2.push('Video Notizen (Markdown möglich)');
  col2.push('MD:');
  col2.push('Notizen');
  col2.push('Einfacher Text ohne Formatierung.');
  col2.push('SC:');
  col2.push('MC-Aufgaben zu Städten');
  col2.push('Wie heißt die Hauptstadt von Frankreich?');
  col2.push('*Paris');
  col2.push('Lyon');
  col2.push('Marseille');
  col2.push('');
  col2.push('Wie heißt die Hauptstadt von Österreich?');
  col2.push('*Wien');
  col2.push('Berlin');
  col2.push('München');

  const maxLen = Math.max(col1.length, col2.length);
  const aoa: any[][] = [];
  aoa.push(['Beispielkurs 1', 'Beispielkurs 2']); // Zeile 1: Titel
  aoa.push(['Geographie', 'Geschichte']); // Zeile 2: Kategorie
  aoa.push(['Ein grundlegender Einführungskurs mit verschiedenen Lektionstypen.', 'Kurs über historische Ereignisse.']); // Zeile 3: Beschreibung
  for (let i=0;i<maxLen;i++) {
    aoa.push([col1[i]||'', col2[i]||'']);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // Spaltenbreiten etwas vergrößern
  (ws as any)['!cols'] = [{ wch: 50 }, { wch: 50 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Import');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string | undefined;
  if (!session?.user || !['author','admin','teacher'].includes(String(role))) {
    return NextResponse.json({ success:false, error:'Keine Berechtigung' }, { status:403 });
  }
  const buf = buildTemplate();
  const u8 = new Uint8Array(buf); // kompatibel als BodyInit
  return new Response(u8, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="kurs-import-template.xlsx"'
    }
  });
}
