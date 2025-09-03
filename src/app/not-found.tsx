export default function NotFound(){
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center text-center px-4">
      <h1 className="text-2xl font-bold mb-3">Seite nicht gefunden</h1>
      <p className="text-sm text-gray-600 mb-6">Die angeforderte Ressource existiert nicht oder wurde verschoben.</p>
      <a href="/" className="px-4 py-2 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">Zur Startseite</a>
    </div>
  );
}