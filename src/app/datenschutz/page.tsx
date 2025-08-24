export const metadata = { title: 'Datenschutz | LernArena' };

const NAME = 'Matthias Gmeiner';
const STRASSE = 'Herrengutgasse 16b';
const PLZORT = '6923 Lauterach';
const LAND = 'Österreich';

export default function DatenschutzPage(){
  return (
    <main className="max-w-3xl mx-auto px-4 py-12">
      <article className="prose prose-sm sm:prose base:prose-lg max-w-none">
        <h1>Datenschutz</h1>
        <p>
          Verantwortlicher:<br/>
          {NAME}<br/>
          {STRASSE}<br/>
          {PLZORT}<br/>
          {LAND}
        </p>
        <p>Diese Plattform speichert nur die für den Betrieb notwendigen Nutzerdaten (z.B. Login- und Lernfortschrittsinformationen). Optionale Analyse- oder Tracking-Dienste sind derzeit nicht aktiv.</p>
      </article>
    </main>
  );
}
