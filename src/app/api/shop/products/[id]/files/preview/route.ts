import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { generatePdfPreviewImagesForShopFile } from '@/lib/pdf/generatePreviews';

export async function POST(req: Request, ctx: { params: { id: string } }){
  try {
    const session: any = await getServerSession(authOptions as any);
    const role = session?.user?.role;
    if(!session || !['teacher','admin','author'].includes(role)){
      return NextResponse.json({ success:false, error:'Kein Zugriff' }, { status:403 });
    }
    const body = await req.json();
    const { key, name } = body||{};
    if(!key){ return NextResponse.json({ success:false, error:'key fehlt' }, { status:400 }); }
    const out = await generatePdfPreviewImagesForShopFile(ctx.params.id, key, name);
    if(!out) return NextResponse.json({ success:false, generated:false });
    return NextResponse.json({ success:true, generated:true, ...out });
  } catch(e){
    console.error('preview generation error', e);
    return NextResponse.json({ success:false, error:'Serverfehler' }, { status:500 });
  }
}
