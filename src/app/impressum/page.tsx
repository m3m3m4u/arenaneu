export const metadata = { title: 'Impressum | LernArena' };

// Bekannte Angaben
const NAME = 'Matthias Gmeiner';
const STRASSE = 'Herrengutgasse 16b';
const PLZORT = '6923 Lauterach';
const LAND = 'Österreich';

export default function ImpressumPage(){
  return (
    <main className="max-w-3xl mx-auto px-4 py-12">
      <article className="prose prose-sm sm:prose base:prose-lg max-w-none">
        <h1>Impressum</h1>
        <p>
          {NAME}<br/>
          {STRASSE}<br/>
          {PLZORT}<br/>
          {LAND}
        </p>
      </article>
    </main>
  );
}
