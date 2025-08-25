"use client";
import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import StickyTable from '@/components/shared/StickyTable';

type TeacherClass = { _id: string; name: string };
type CourseInfo = { _id: string; title: string; totalLessons: number };
type LearnerRow = {
  username: string;
  name: string;
  email: string | null;
  stars: number;
  completedTotal: number;
  perCourse: Record<string, { completed: number; total: number; percent: number }>;
  firstTry?: { first: number; total: number; percent: number };
};

export default function TeacherStatisticsPage(){
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [mode, setMode] = useState<'class'|'all'>('class');
  const [loading, setLoading] = useState(false);
  const [courses, setCourses] = useState<CourseInfo[]>([]);
  const [learners, setLearners] = useState<LearnerRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(()=>{
    // Klassen-Liste laden
    (async()=>{
      try{
        const res = await fetch('/api/teacher/courses/manage');
        const d = await res.json();
        if(res.ok && d.success){
          const list: TeacherClass[] = (d.classes||[]).map((c:any)=>({ _id: c._id, name: c.name }));
          setClasses(list);
          if(list.length && !selectedClass){ setSelectedClass(list[0]._id); }
        } else {
          setError(d.error || 'Fehler beim Laden der Klassen');
        }
      } catch(e:any){ setError('Netzwerkfehler beim Laden der Klassen'); }
    })();
  },[]);

  useEffect(()=>{
    if(!selectedClass) return;
    setLoading(true);
    setError(null);
    (async()=>{
      try{
    const res = await fetch(`/api/teacher/statistics?classId=${encodeURIComponent(selectedClass)}&mode=${mode}`);
        const d = await res.json();
        if(res.ok && d.success){
          setCourses(d.courses||[]);
          setLearners(d.learners||[]);
        } else {
          setError(d.error || 'Fehler beim Laden der Statistik');
        }
      } catch(e:any){ setError('Netzwerkfehler beim Laden der Statistik'); }
      finally { setLoading(false); }
    })();
  },[selectedClass, mode]);

  // (Hinweis: columns für StickyTable werden weiter unten inline definiert; diese Variable kann später entfernt werden)

  function shapeForExport(){
  const head = ['Name', ...courses.map(c=>`${c.title} (${c.totalLessons})`), 'Sterne', 'Gesamt', '1.Versuch %'];
    const rows2d = learners.map(l=>{
      const base = [l.name || l.username];
      const per = courses.map(c=>{
        const cell = l.perCourse?.[c._id] || { completed:0, total:c.totalLessons, percent:0 };
        return `${cell.completed}/${cell.total}`;
      });
  return [...base, ...per, String(l.stars ?? 0), String(l.completedTotal ?? 0), `${l.firstTry?.percent ?? 0}%`];
    });
    return { head, rows: rows2d };
  }

  async function exportExcel(){
    const { head, rows } = shapeForExport();
    const xlsx = await import('xlsx');
    const ws = xlsx.utils.aoa_to_sheet([head, ...rows]);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Statistik');
    const out = xlsx.write(wb, { bookType:'xlsx', type:'array' });
    const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `statistik_${selectedClass || 'klasse'}.xlsx`; a.click();
    URL.revokeObjectURL(url);
  }

  async function exportPDF(){
    const { head, rows } = shapeForExport();
    const jsPDF = (await import('jspdf')).default;
    const autoTable = (await import('jspdf-autotable')).default;
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.text('Statistik', 14, 14);
  (autoTable as any)(doc, { head: [head], body: rows, startY: 20, styles: { fontSize: 8 } });
    doc.save(`statistik_${selectedClass || 'klasse'}.pdf`);
  }

  async function exportWord(){
    const { head, rows } = shapeForExport();
    const { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType, TextRun } = await import('docx');
    const tableRows = [
      new TableRow({ children: head.map(h=> new TableCell({ width:{size:1000, type:WidthType.AUTO}, children:[ new Paragraph({ children:[ new TextRun({ text: h, bold: true }) ] }) ] })) }),
      ...rows.map(r=> new TableRow({ children: r.map(cell=> new TableCell({ width:{size:1000, type:WidthType.AUTO}, children:[ new Paragraph(String(cell)) ] })) }))
    ];
    const doc = new Document({ sections: [{ children: [ new Paragraph({ children:[ new TextRun({ text:'Statistik', bold:true, size:28 }) ] }), new Table({ rows: tableRows }) ] }] });
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `statistik_${selectedClass || 'klasse'}.docx`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Statistik</h1>
        <div className="flex gap-2">
          <button onClick={()=>router.push('/teacher')} className="px-3 py-2 border rounded hover:bg-gray-50">← Zurück</button>
        </div>
      </div>

      {/* Hilfe: Statistik verstehen */}
      <details className="bg-blue-50 border border-blue-200 text-blue-900 rounded p-4 mb-4 text-sm">
        <summary className="font-semibold cursor-pointer">Wie funktioniert das? (Hilfe)</summary>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>Wähle oben eine Klasse. Mit „Kursumfang“ steuerst du, ob nur Klassenkurse oder alle veröffentlichten Kurse ausgewertet werden.</li>
          <li>Pro Kurs siehst du den Fortschritt „abgeschlossen/gesamt“ sowie eine Fortschrittsleiste.</li>
          <li>„⭐ Sterne“ summiert die in Lektionen verdienten Sterne; „✔️ gesamt“ zählt abgeschlossene Lektionen.</li>
          <li>„🎯 1. Versuch %“ Anteil korrekt beantworteter Fragen direkt beim ersten Versuch (über protokollierte Fragen).</li>
          <li>Du kannst die Tabelle als Excel, PDF oder Word exportieren.</li>
          <li>Hinweis: In Minigame-Lektionen wählen Lernende selbst die Spielform (Snake, Autospiel, Flugzeugspiel, PacMan oder Space Impact).</li>
        </ul>
      </details>

      <div className="bg-white border rounded p-4 mb-4">
        <div className="flex flex-col lg:flex-row lg:items-end gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Klasse wählen</label>
            <select value={selectedClass} onChange={e=>setSelectedClass(e.target.value)} className="border rounded px-3 py-2 min-w-[280px]">
              <option value="">– Klasse auswählen –</option>
              {classes.map(c=> (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Kursumfang</label>
            <div className="inline-flex border rounded overflow-hidden">
              <button type="button" className={(mode==='class'? 'bg-blue-600 text-white':'bg-white text-gray-700 hover:bg-gray-50')+" px-3 py-2 border-r"} onClick={()=>setMode('class')}>Klassenkurse</button>
              <button type="button" className={(mode==='all'? 'bg-blue-600 text-white':'bg-white text-gray-700 hover:bg-gray-50')+" px-3 py-2"} onClick={()=>setMode('all')}>Alle Kurse</button>
            </div>
            <div className="text-xs text-gray-500 mt-1">{mode==='class' ? 'Nur der Klasse zugeordnete Kurse' : 'Alle veröffentlichten Kurse'}</div>
          </div>
          <div className="lg:ml-auto flex gap-2">
            <button type="button" onClick={exportExcel} className="px-3 py-2 border rounded hover:bg-gray-50">Excel</button>
            <button type="button" onClick={exportPDF} className="px-3 py-2 border rounded hover:bg-gray-50">PDF</button>
            <button type="button" onClick={exportWord} className="px-3 py-2 border rounded hover:bg-gray-50">Word</button>
          </div>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded mb-4">{error}</div>}

      <div className="bg-white border rounded">
        <StickyTable
          columns={useMemo(()=>[
            { key:'learner', header:'Lernende/r', sticky:true, tdClassName:'whitespace-nowrap px-4 py-2', thClassName:'px-4 py-2', render:(l:LearnerRow)=> (
              <div>
                <div className="font-medium">{l.name}</div>
                <div className="text-gray-500 text-xs">@{l.username}{l.email? ` • ${l.email}`:''}</div>
              </div>
            )},
            ...courses.map(c=> ({
              key:`course:${c._id}`,
              header: `${c.title} (${c.totalLessons})`,
              tdClassName:'whitespace-nowrap px-4 py-2',
              thClassName:'px-4 py-2',
              render:(l:LearnerRow)=>{
                const cell = l.perCourse?.[c._id] || { completed:0, total:c.totalLessons, percent:0 };
                return (
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-gray-200 rounded overflow-hidden">
                      <div className="h-2 bg-green-500" style={{ width: `${Math.min(100, Math.max(0, cell.percent))}%` }} />
                    </div>
                    <span className="tabular-nums">{cell.completed}/{cell.total}</span>
                  </div>
                );
              }
            })),
            { key:'stars', header:'⭐ Sterne', tdClassName:'whitespace-nowrap px-4 py-2', thClassName:'px-4 py-2' },
            { key:'completedTotal', header:'✔️ gesamt', tdClassName:'whitespace-nowrap px-4 py-2', thClassName:'px-4 py-2' },
            { key:'firstTry', header:'🎯 1. Versuch %', tdClassName:'whitespace-nowrap px-4 py-2', thClassName:'px-4 py-2', render:(l: LearnerRow)=> (
              <div className="flex items-center gap-2">
                <div className="w-20 h-2 bg-gray-200 rounded overflow-hidden">
                  <div className="h-2 bg-purple-500" style={{ width: `${Math.min(100, Math.max(0, l.firstTry?.percent || 0))}%` }} />
                </div>
                <span className="tabular-nums">{l.firstTry?.percent ?? 0}%</span>
              </div>
            ) },
          ], [courses])}
          rows={learners as any}
          minWidthClassName="min-w-[900px]"
          zebra
          emptyMessage="Keine Lernenden in dieser Klasse."
          loading={loading}
        />
      </div>
    </main>
  );
}
