// Hilfsfunktionen zur automatischen Auflösung von Mediapfaden

const ABSOLUTE_OR_DATA = /^(https?:\/\/)|^data:|^blob:|^\//i;
const HAS_SLASH = /\//;
// Match file extensions at end or before query/hash
const IMG_EXT = /\.(png|jpe?g|gif|webp|svg)(?=($|\?|#))/i;
const AUDIO_EXT = /\.(mp3|wav|ogg|m4a)(?=($|\?|#))/i;

export type MediaKind = 'image' | 'audio' | 'file';

export function detectMediaKind(input: string): MediaKind {
  if (IMG_EXT.test(input)) return 'image';
  if (AUDIO_EXT.test(input)) return 'audio';
  return 'file';
}

/**
 * Resolvt kurze Medienangaben (nur Dateiname) automatisch in public-Pfade.
 * Regeln:
 * - Bereits absolute URLs (http, https, data) oder beginnend mit "/" bleiben unangetastet
 * - Enthält der String einen Slash, wird nur ein führendes "/" ergänzt (z. B. "uploads/x.jpg" -> "/uploads/x.jpg")
 * - Reiner Dateiname ohne Slash wird je nach Endung auf Standardordner gemappt:
 *   - Bilder/Audio/Datei -> bevorzugt "/uploads/<name>"; wenn WebDAV aktiv, via Proxy "/medien/uploads/<name>"
 */
export function resolveMediaPath(input: string): string {
  if (!input) return input;
  let cleaned = String(input).trim().replace(/\\/g, '/');
  // "public/" gehört nicht in die URL; strippen
  if (cleaned.toLowerCase().startsWith('public/')) cleaned = cleaned.slice(7);
  if (ABSOLUTE_OR_DATA.test(cleaned)) return cleaned;
  // Umgebung erkennen: auf Vercel bevorzugen wir den Medien-Proxy
  const isBrowser = typeof window !== 'undefined';
  const isVercelHost = isBrowser ? /vercel\.app$/i.test(window.location.hostname) : !!(process as any)?.env?.VERCEL;
  // Falls ein bereits proxied Pfad (/medien/uploads/...) vorliegt aber wir NICHT auf Vercel sind -> zurück auf /uploads/
  if (/^\/medien\/uploads\//i.test(cleaned) && !isVercelHost) {
    cleaned = cleaned.replace(/^\/medien\/uploads\//i, '/uploads/');
  }
  // Wenn bereits ein Pfad mit Slash: ggf. auf Proxy umbiegen
  if (HAS_SLASH.test(cleaned)) {
    const withSlash = cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
    // uploads-Pfade über Proxy ausliefern: auf Vercel immer, sonst nur direkt aus /uploads
    if (/^\/uploads\//i.test(withSlash)) {
      return isVercelHost ? withSlash.replace(/^\/uploads\//i, '/medien/uploads/') : withSlash;
    }
    return withSlash;
  }
  const kind = detectMediaKind(cleaned);
  // Standardmäßig bevorzugen wir Uploads als Quelle
  switch (kind) {
    case 'image':
      return isVercelHost ? `/medien/uploads/${cleaned}` : `/uploads/${cleaned}`;
    case 'audio':
      return isVercelHost ? `/medien/uploads/${cleaned}` : `/uploads/${cleaned}`;
    default:
      return isVercelHost ? `/medien/uploads/${cleaned}` : `/uploads/${cleaned}`;
  }
}

// Kanonische Form für Speicherung in DB: immer /uploads/<name> für interne Dateien
export function canonicalizeMediaPath(input: string | undefined | null): string | undefined {
  if (!input) return undefined;
  let p = String(input).trim();
  if (!p) return undefined;
  if (ABSOLUTE_OR_DATA.test(p)) return p; // absolute Pfade unverändert
  p = p.replace(/\\/g,'/');
  if (p.toLowerCase().startsWith('public/')) p = p.slice(7);
  // Entferne Proxy-Präfix
  if (/^\/medien\/uploads\//i.test(p)) p = p.replace(/^\/medien\/uploads\//i, '/uploads/');
  // Falls ohne führenden Slash aber bereits Ordner referenziert
  if (!p.startsWith('/') && /\//.test(p)) p = '/' + p;
  // Reiner Dateiname?
  if (!/\//.test(p)) p = '/uploads/' + p;
  // Falls noch kein /uploads/ Präfix aber nur Dateiname -> oben behandelt
  // Normalisiere doppelte Slashes
  p = p.replace(/\/+/g,'/');
  return p;
}

export function isImagePath(p: string) { return IMG_EXT.test(p); }
export function isAudioPath(p: string) { return AUDIO_EXT.test(p); }
