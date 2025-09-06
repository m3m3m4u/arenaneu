// Server-seitige PDF->Bild Vorschau-Generierung für Shop-Dateien
// Hinweis: Benötigt die optionale Abhängigkeit "canvas" (node-canvas)
export const runtime = 'nodejs';

import dbConnect from '@/lib/db';
import ShopProduct from '@/models/ShopProduct';
import { isS3Enabled, s3Put, s3PublicUrl } from '@/lib/storage';
import { isWebdavEnabled, davPut, webdavPublicUrl, davGet } from '@/lib/webdavClient';
import { isShopWebdavEnabled, shopDavPut, shopWebdavPublicUrl, anyShopWebdavEnabled, shopDavGet } from '@/lib/webdavShopClient';

type PdfModule = typeof import('pdfjs-dist');

function publicUrlForKey(key: string): string | null {
  if (isShopWebdavEnabled()) return shopWebdavPublicUrl(key);
  if (isWebdavEnabled()) return webdavPublicUrl(key);
  if (isS3Enabled()) return s3PublicUrl(key);
  return null;
}

async function uploadImage(key: string, data: Uint8Array, contentType = 'image/png'): Promise<string | null> {
  try {
    if (isShopWebdavEnabled()) {
      const up = await shopDavPut(key, data, contentType);
      return up?.url || shopWebdavPublicUrl(key);
    }
    if (isWebdavEnabled()) {
      const up = await davPut(key, data, contentType);
      return up?.url || webdavPublicUrl(key);
    }
    if (isS3Enabled()) {
      const up = await s3Put(key, data, contentType);
      return up?.url || null;
    }
  } catch (e) {
    console.warn('[generatePreviews] Upload fehlgeschlagen', key, (e as any)?.message);
  }
  return null;
}

export async function generatePdfPreviewImagesForShopFile(productId: string, fileKey: string, fileName?: string, opts?: { maxPages?: number; dpi?: number }): Promise<{ urls: string[]; pages: number } | null> {
  await dbConnect();
  const prod: any = await ShopProduct.findById(productId);
  if (!prod) return null;
  const file = prod.files.find((f: any) => f.key === fileKey);
  if (!file) return null;
  try {
    const pdfjsLib: PdfModule = (await import('pdfjs-dist')) as any;
    // Canvas Backend (node-canvas) dynamisch laden
    let createCanvas: ((w: number, h: number) => any) | null = null;
    try {
      // dynamischer require via eval, damit Bundler das native Modul nicht einpackt
      const req = (eval as unknown as (s: string)=>any)('require');
      createCanvas = req('@napi-rs/canvas').createCanvas;
    } catch (e) {
      console.warn('[generatePreviews] Canvas Backend nicht verfügbar – Überspringe Server-Rendering.');
      return null;
    }

    const maxPages = Math.max(1, Math.min(20, opts?.maxPages ?? 8));
    const dpi = Math.max(72, Math.min(300, opts?.dpi ?? 150)); // sinnvolle Web-Vorschau

  // Quelle laden: bevorzugt direkt über WebDAV/S3-Client statt /medien-Proxy
    let buf: Uint8Array | null = null;
    if (isShopWebdavEnabled()) {
      buf = await shopDavGet(fileKey);
    }
    if (!buf && isWebdavEnabled()) {
      buf = await davGet(fileKey);
    }
    if (!buf && isS3Enabled()) {
      try {
        const url = s3PublicUrl(fileKey);
        const r = await fetch(url);
        if (r.ok) buf = new Uint8Array(await r.arrayBuffer());
      } catch {}
    }
    if (!buf) {
      // letzter Versuch über Public-URL (z. B. /medien Proxy)
      const sourceUrl = publicUrlForKey(fileKey);
      if (sourceUrl) {
        const r = await fetch(sourceUrl).catch(()=>null as any);
        if (r && r.ok) buf = new Uint8Array(await r.arrayBuffer());
      }
    }
    if (!buf) {
      console.warn('[generatePreviews] PDF Quelle nicht lesbar', { fileKey });
      return null;
    }

    // PDF laden (ohne Worker im Node-Kontext)
  const task = (pdfjsLib as any).getDocument({ data: buf, useSystemFonts: true, enableXfa: false, disableCreateObjectURL: true });
    const pdf = await task.promise;
    const numPages: number = pdf.numPages || 1;

    const urls: string[] = [];
    const baseName = (fileName || 'datei').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/\.(pdf|PDF)$/,'');
    const baseKey = `thumbnails/${prod._id}`; // konsistent zur Thumb-Route
    const scale = dpi / 72; // 72pt = 1in

    for (let p = 1; p <= Math.min(numPages, maxPages); p++) {
      const page = await pdf.getPage(p);
      // Viewport skaliert, Seitenverhältnis bleibt erhalten
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas!(Math.max(1, Math.floor(viewport.width)), Math.max(1, Math.floor(viewport.height)));
      const ctx = canvas.getContext('2d');
      // Weißer Hintergrund, damit transparente Flächen nicht schwarz wirken
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const renderContext = { canvasContext: ctx, viewport, background: 'white' } as any;
      await page.render(renderContext).promise;
      const png: Buffer = canvas.toBuffer('image/png');
      const targetKey = `${baseKey}/${baseName}_p${p}.png`;
      const url = await uploadImage(targetKey, png as unknown as Uint8Array, 'image/png');
      if (url) urls.push(url);
    }

    // DB anreichern
    file.previewImages = urls;
    file.pages = numPages;
    await prod.save();
    return { urls, pages: numPages };
  } catch (e) {
    console.error('[generatePreviews] Fehler', (e as any)?.message);
    return null;
  }
}

// Variante: Erzeuge Previews direkt aus gelieferten PDF-Bytes (vermeidet Race nach Upload)
export async function generatePdfPreviewImagesForShopFileBytes(
  productId: string,
  fileKey: string,
  fileName: string | undefined,
  pdfBytes: Uint8Array,
  opts?: { maxPages?: number; dpi?: number }
): Promise<{ urls: string[]; pages: number } | null> {
  await dbConnect();
  const prod: any = await ShopProduct.findById(productId);
  if (!prod) return null;
  const file = prod.files.find((f: any) => f.key === fileKey);
  if (!file) return null;
  try {
    const pdfjsLib: PdfModule = (await import('pdfjs-dist')) as any;
    let createCanvas: ((w: number, h: number) => any) | null = null;
    try {
      const req = (eval as unknown as (s: string)=>any)('require');
      createCanvas = req('@napi-rs/canvas').createCanvas;
    } catch (e) {
      console.warn('[generatePreviews] Canvas Backend nicht verfügbar – Überspringe Server-Rendering.');
      return null;
    }
    const maxPages = Math.max(1, Math.min(20, opts?.maxPages ?? 8));
    const dpi = Math.max(72, Math.min(300, opts?.dpi ?? 150));

    const task = (pdfjsLib as any).getDocument({ data: pdfBytes, useSystemFonts: true, enableXfa: false, disableCreateObjectURL: true });
    const pdf = await task.promise;
    const numPages: number = pdf.numPages || 1;

    const urls: string[] = [];
    const baseName = (fileName || 'datei').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/\.(pdf|PDF)$/,'');
    const baseKey = `thumbnails/${prod._id}`;
    const scale = dpi / 72;

    for (let p = 1; p <= Math.min(numPages, maxPages); p++) {
      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas!(Math.max(1, Math.floor(viewport.width)), Math.max(1, Math.floor(viewport.height)));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const renderContext = { canvasContext: ctx, viewport, background: 'white' } as any;
      await page.render(renderContext).promise;
      const png: Buffer = canvas.toBuffer('image/png');
      const targetKey = `${baseKey}/${baseName}_p${p}.png`;
      const url = await uploadImage(targetKey, png as unknown as Uint8Array, 'image/png');
      if (url) urls.push(url);
    }

    file.previewImages = urls;
    file.pages = numPages;
    await prod.save();
    return { urls, pages: numPages };
  } catch (e) {
    console.error('[generatePreviews] Fehler(bytes)', (e as any)?.message);
    return null;
  }
}
