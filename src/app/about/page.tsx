export const metadata = { title: 'Über uns | LernArena' };

export default function AboutPage(){
  return (
    <main className="max-w-6xl mx-auto px-4 lg:px-6 py-10 md:py-14">
      <div className="grid lg:grid-cols-[220px_1fr] gap-10">
        <aside className="hidden lg:block">
          <nav aria-label="Inhalt" className="sticky top-24 text-sm">
            <ul className="space-y-2 border-l pl-4">
              {[
                ['start','Überblick'],
                ['lehr','Lehrpersonen'],
                ['schueler','Schüler:innen'],
                ['eltern','Eltern'],
                ['ansatz','Ansatz'],
                ['verantwortung','Verantwortung']
              ].map(([id,label])=> (
                <li key={id}>
                  <a href={'#'+id} className="block text-gray-600 hover:text-gray-900 hover:translate-x-0.5 transition-transform">{label}</a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
        <article className="prose prose-sm sm:prose-base lg:prose-lg max-w-none">
          <header id="start" className="mb-10">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">Über uns</h1>
            <p className="text-lg md:text-xl text-gray-700 leading-relaxed">Die LernArena ist ein digitaler Lernraum: klar, spielerisch und fokussiert. Lernen in kleinen Schritten – mit sichtbaren Erfolgen ohne Ablenkung.</p>
            <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-medium px-5 py-2 shadow">
              Schuljahr 2025/26: kostenlos & werbefrei garantiert
            </div>
          </header>

          <section id="lehr" className="scroll-mt-24">
            <h2 className="text-2xl font-semibold flex items-center gap-2">Für Lehrpersonen <span className="text-xs font-normal bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Didaktik</span></h2>
            <div className="mt-4 bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
              <ul className="grid md:grid-cols-2 gap-3 !mt-0">
                <li className="flex gap-2"><span className="text-blue-600 font-bold">•</span>Einfache Erstellung oder Import verschiedener Aufgabentypen.</li>
                <li className="flex gap-2"><span className="text-blue-600 font-bold">•</span>Schneller Überblick über Lernstände und Lektionsabschlüsse.</li>
                <li className="flex gap-2"><span className="text-blue-600 font-bold">•</span>Motivation durch Punkte & Fortschritt, nicht durch Ablenkung.</li>
                <li className="flex gap-2"><span className="text-blue-600 font-bold">•</span>Datensparsam – nur notwendige Nutzungsdaten.</li>
                <li className="flex gap-2"><span className="text-blue-600 font-bold">•</span>Viele fertige Kurse sofort einsetzbar & frei anpassbar.</li>
              </ul>
              <p className="mt-4 text-sm text-gray-600">Eingabe von Schülerdaten nicht notwendig.</p>
            </div>
          </section>

            <section id="schueler" className="mt-16 scroll-mt-24">
            <h2 className="text-2xl font-semibold flex items-center gap-2">Für Schülerinnen & Schüler <span className="text-xs font-normal bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Lernen</span></h2>
            <div className="mt-4 bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
              <ul className="grid md:grid-cols-2 gap-3 !mt-0">
                <li className="flex gap-2"><span className="text-green-600 font-bold">•</span>Kurze, klare Aufgaben mit sofortigem Feedback.</li>
                <li className="flex gap-2"><span className="text-green-600 font-bold">•</span>Abwechslung durch verschiedene Formate (Zuordnen, Lücken, Memory ...).</li>
                <li className="flex gap-2"><span className="text-green-600 font-bold">•</span>Wiederholen möglich – besser werden ohne Druck.</li>
                <li className="flex gap-2"><span className="text-green-600 font-bold">•</span>Keine Werbung oder störende Popups.</li>
                <li className="flex gap-2"><span className="text-green-600 font-bold">•</span>Input durch kurze Erklärvideos oder Info-Texte/-Grafiken – Lernen auch ohne Lehrperson.</li>
              </ul>
              <p className="mt-4 text-sm text-gray-600">Nur Daten, die für deinen Lernstand nötig sind, werden gespeichert.</p>
            </div>
          </section>

          <section id="eltern" className="mt-16 scroll-mt-24">
            <h2 className="text-2xl font-semibold flex items-center gap-2">Für Eltern <span className="text-xs font-normal bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Transparenz</span></h2>
            <div className="mt-4 bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
              <ul className="grid md:grid-cols-2 gap-3 !mt-0">
                <li className="flex gap-2"><span className="text-purple-600 font-bold">•</span>Klar nachvollziehbare Fortschritte.</li>
                <li className="flex gap-2"><span className="text-purple-600 font-bold">•</span>Keine Werbetracker oder Datenverkauf.</li>
                <li className="flex gap-2"><span className="text-purple-600 font-bold">•</span>Fokus auf Inhalte statt Ablenkung.</li>
                <li className="flex gap-2"><span className="text-purple-600 font-bold">•</span>Qualität vor Masse bei neuen Inhalten.</li>
                <li className="flex gap-2"><span className="text-purple-600 font-bold">•</span>Kurze Erklärvideos & Info-Material ermöglichen selbstständiges Lernen ohne Lehrperson.</li>
              </ul>
              <p className="mt-4 text-sm text-gray-600">Mit und ohne Account nutzbar.</p>
            </div>
          </section>

          <section id="ansatz" className="mt-20 scroll-mt-24">
            <h2 className="text-2xl font-semibold">Ansatz</h2>
            <p className="mt-4 leading-relaxed">Wir setzen auf Klarheit, kurze Interaktionen und direkte Rückmeldungen. Motivation entsteht durch sichtbaren Fortschritt und kleine Erfolgsmomente – nicht durch manipulative Mechaniken.</p>
          </section>

          <section id="verantwortung" className="mt-16 scroll-mt-24">
            <h2 className="text-2xl font-semibold">Datenschutz & Verantwortung</h2>
            <p className="mt-4 leading-relaxed">Wir verarbeiten nur, was für Betrieb und Lernfortschritt notwendig ist. Keine versteckten Drittanbieter-Skripte ohne Einwilligung. Details: <a href="/datenschutz">Datenschutz</a>.</p>
          </section>

          <footer className="mt-24 border-t pt-6 text-xs text-gray-500">Stand: {new Date().toLocaleDateString('de-DE')}</footer>
        </article>
      </div>
    </main>
  );
}
