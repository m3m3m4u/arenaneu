import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import dbConnect from '@/lib/db';
import TempShopFile from '@/models/TempShopFile';
import { randomBytes } from 'crypto';
import { isShopWebdavEnabled, shopDavPut } from '@/lib/webdavShopClient';
import { isWebdavEnabled, davPut } from '@/lib/webdavClient';
import { isS3Enabled, s3Put, s3PublicUrl } from '@/lib/storage';

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
		for(const f of files){
			if(!(f instanceof File)) continue;
			const arrayBuf = await f.arrayBuffer();
			const buf = new Uint8Array(arrayBuf);
			const safeName = f.name.replace(/[^a-zA-Z0-9._-]+/g,'_');
			let rand = 'xxxx';
			try {
				let rb: any;
				try { rb = (randomBytes as any)(4); } catch { rb = (randomBytes as any)(); }
				const bytes: number[] = Array.from(new Uint8Array(rb)).slice(0,4);
				rand = bytes.map(b=> b.toString(16).padStart(2,'0')).join('');
			} catch {}
			const key = `temp/${user}/${Date.now()}_${rand}_${safeName}`;
			try {
				if(useDav){
					if(useShop) await shopDavPut(key, buf, f.type||undefined); else await davPut(key, buf, f.type||undefined);
				} else if(isS3Enabled()) {
					await s3Put(key, buf, f.type||'application/octet-stream');
				} else {
					return NextResponse.json({ success:false, error:'Kein Storage konfiguriert' }, { status:500 });
				}
				const doc = await TempShopFile.create({ key, name: f.name, size: buf.length, contentType: f.type||undefined, createdBy: user });
				created.push({ key, name: f.name, size: buf.length, contentType: f.type||undefined, id: doc._id });
			} catch(e:any){
				console.warn('Temp upload failed', e);
				errors.push({ name: f.name, message: e?.message || 'Upload fehlgeschlagen' });
			}
		}
		if(!created.length){
			return NextResponse.json({ success:false, error:'Kein Datei-Upload gelungen', errors }, { status:500 });
		}
		return NextResponse.json({ success:true, files: created, temp: created[0]||null, errors: errors.length? errors: undefined });
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
		const docs = await TempShopFile.find({ createdBy: user }).sort({ createdAt: -1 }).limit(50).lean();
		return NextResponse.json({ success:true, files: docs.map(d=> ({ key: d.key, name: d.name, size: d.size, contentType: d.contentType, createdAt: d.createdAt })) });
	} catch(e){
		console.error('temp-files GET error', e);
		return NextResponse.json({ success:false, error:'Fehler' }, { status:500 });
	}
}