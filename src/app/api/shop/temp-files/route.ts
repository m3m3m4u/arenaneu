import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import dbConnect from '@/lib/db';
import TempShopFile from '@/models/TempShopFile';
import { randomBytes } from 'crypto';
import { isShopWebdavEnabled, shopDavPut } from '@/lib/webdavShopClient';
import { isWebdavEnabled, davPut } from '@/lib/webdavClient';
import { isS3Enabled, s3Put } from '@/lib/storage';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST: multipart/form-data (field "file") mehrere Dateien
export async function POST(req: Request){
	try {
		await dbConnect();
		const session: any = await getServerSession(authOptions as any);
		if(!session){
			return NextResponse.json({ success:false, error:'Nicht eingeloggt' }, { status:401 });
		}
		const formData = await req.formData();
		const files = formData.getAll('file');
		if(!files.length){
			return NextResponse.json({ success:false, error:'Keine Dateien' }, { status:400 });
		}
		const created:any[] = [];
		const errors: Array<{ name:string; message:string }> = [];
		const user = session.user?.username || session.user?.email || 'user';
		const useShop = isShopWebdavEnabled();
		const useDav = useShop || isWebdavEnabled();
		const useS3 = !useDav && isS3Enabled();
		console.log('[temp-files] storage flags', { useShop, genericWebdav: isWebdavEnabled(), useDav, useS3, user, count: files.length });
		console.log('[temp-files] erhaltene FormData file-Einträge:', files.map(f=> ({ type: typeof f, name: (f as any)?.name, hasArrayBuffer: !!(f as any)?.arrayBuffer })));
		const attempts: any[] = [];
		for(const raw of files){
			const f: any = raw; // Kann File, Blob oder unbekannt sein
			if(!f || typeof f.arrayBuffer !== 'function'){
				errors.push({ name: 'unbekannt', message: 'Kein gültiges Dateiobjekt (arrayBuffer fehlt)' });
				attempts.push({ name: 'unbekannt', status:'skip-invalid' });
				continue;
			}
			// Name ermitteln
			const originalName = typeof f.name === 'string' && f.name.trim() ? f.name : 'upload.bin';
			const arrayBuf = await f.arrayBuffer();
			const buf = new Uint8Array(arrayBuf);
			// Unicode-freundliche Sanitisierung: Umlaute & Buchstaben behalten, sonst ersetzen
			const safeName = (()=>{
				try{
					const normalized = originalName.normalize('NFC');
					const kept = normalized
						.replace(/[^\p{L}\p{N}._\-\s]+/gu, '_')
						.replace(/\s+/g, '_')
						.replace(/^_+|_+$/g, '')
						.slice(0,180);
					return kept || 'upload.bin';
				} catch{
					// Fallback: erhalte deutsche Umlaute/ß explizit
					return originalName.replace(/[^a-zA-Z0-9._\-äöüÄÖÜß]+/g,'_').replace(/^_+|_+$/g,'').slice(0,180) || 'upload.bin';
				}
			})();
			let rand = 'xxxx';
			try {
				let rb: any;
				try { rb = (randomBytes as any)(4); } catch { rb = (randomBytes as any)(); }
				const bytes: number[] = Array.from(new Uint8Array(rb)).slice(0,4);
				rand = bytes.map(b=> b.toString(16).padStart(2,'0')).join('');
			} catch {}
			const key = `temp/${user}/${Date.now()}_${rand}_${safeName}`;
			console.log('[temp-files] attempt start', { originalName, size: buf.length });
			try {
				if(useDav){
					if(useShop) await shopDavPut(key, buf, f.type||undefined); else await davPut(key, buf, f.type||undefined);
				} else if(isS3Enabled()) {
					await s3Put(key, buf, f.type||'application/octet-stream');
				} else {
					return NextResponse.json({ success:false, error:'Kein Storage konfiguriert' }, { status:500 });
				}
				const doc = await TempShopFile.create({ key, name: originalName, size: buf.length, contentType: f.type||undefined, createdBy: user });
				created.push({ key, name: originalName, size: buf.length, contentType: f.type||undefined, id: doc._id });
				attempts.push({ name: originalName, status:'ok', key });
				console.log('[temp-files] attempt success', { originalName, key });
			} catch(e:any){
				console.warn('Temp upload failed', e?.message, { originalName, key });
				// Expliziter Fallback: Wenn Shop 401 liefert und generischer WebDAV aktiv ist und es noch nicht versucht wurde
				if(useShop && isWebdavEnabled() && /401/.test(e?.message||'')){
					try {
						console.warn('[temp-files] 401 Shop – versuche generischen WebDAV Fallback für', originalName);
						await davPut(key, buf, f.type||undefined);
						const doc = await TempShopFile.create({ key, name: originalName, size: buf.length, contentType: f.type||undefined, createdBy: user });
						created.push({ key, name: originalName, size: buf.length, contentType: f.type||undefined, id: doc._id });
						attempts.push({ name: originalName, status:'ok-fallback', key, fallback:'generic-webdav' });
						console.log('[temp-files] fallback success (generic webdav)', { originalName, key });
						continue; // nächste Datei
					} catch(fbErr:any){
						console.warn('[temp-files] Fallback generic WebDAV fehlgeschlagen', fbErr?.message);
					}
				}
				errors.push({ name: originalName, message: e?.message || 'Upload fehlgeschlagen' });
				attempts.push({ name: originalName, status:'error', message: e?.message });
			}
		}
		if(!created.length){
			console.warn('[temp-files] Keine Datei erfolgreich gespeichert. Errors:', errors, { attempts });
			return NextResponse.json({ success:false, error:'Kein Datei-Upload gelungen', errors, attempts, received: files.length, storage:{ shopWebdav:useShop, webdav: isWebdavEnabled(), s3: useS3 }, user }, { status:500 });
		}
		console.log('[temp-files] Upload erfolgreich', { count: created.length, user });
		return NextResponse.json({ success:true, files: created, temp: created[0]||null, errors: errors.length? errors: undefined, received: files.length, attempts, storage:{ shopWebdav:useShop, webdav: isWebdavEnabled(), s3: useS3 }, user });
	} catch(e){
		console.error('temp-files POST error', e);
		return NextResponse.json({ success:false, error:'Upload Fehler' }, { status:500 });
	}
}

// GET: Liste eigene (nicht abgelaufene) temp files (Meta) – optional hilfreich für UI Refresh
export async function GET(req: Request){
	try {
		await dbConnect();
		const session: any = await getServerSession(authOptions as any);
		if(!session){
			return NextResponse.json({ success:false, error:'Nicht eingeloggt' }, { status:401 });
		}
		const user = session.user?.username || session.user?.email || 'user';
		const url = new URL(req.url);
		const debug = url.searchParams.get('debug') === '1';
		const query = { createdBy: user } as any;
		const docs = await TempShopFile.find(query).sort({ createdAt: -1 }).limit(50).lean();
		const filesOut = docs.map(d=> ({ key: d.key, name: d.name, size: d.size, contentType: d.contentType, createdAt: d.createdAt }));
		if(debug){
			const totalUser = await TempShopFile.countDocuments({ createdBy: user });
			const totalAll = await TempShopFile.estimatedDocumentCount();
			return NextResponse.json({ success:true, files: filesOut, user, counts:{ user: totalUser, all: totalAll }, storage:{ shopWebdav: isShopWebdavEnabled(), webdav: isWebdavEnabled(), s3: isS3Enabled() } });
		}
		return NextResponse.json({ success:true, files: filesOut });
	} catch(e){
		console.error('temp-files GET error', e);
		return NextResponse.json({ success:false, error:'Fehler' }, { status:500 });
	}
}