import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

export async function GET() {
  try {
  const dir = path.resolve('public', 'media', 'buttons');
    const files = await fs.readdir(dir);
    const exts = /\.(png|jpe?g|gif|webp|svg)$/i;
    // Gruppiere Dateien nach Basisnamen und bevorzuge "down" vor "up"
    type Group = { up?: string; down?: string; other?: string };
    const groups = new Map<string, Group>();
    for (const f of files) {
      if (!exts.test(f)) continue;
      const noExt = f.replace(/\.[^.]+$/, '');
      const isUp = /up$/i.test(noExt);
      const isDown = /down$/i.test(noExt);
      const base = isUp ? noExt.slice(0, -2) : isDown ? noExt.slice(0, -4) : noExt;
      const g = groups.get(base) ?? {};
      if (isDown) g.down = f; else if (isUp) g.up = f; else g.other = f;
      groups.set(base, g);
    }

    const items = Array.from(groups.entries()).map(([base, g]) => {
      const file = g.down ?? g.up ?? g.other!;
      const toPath = (f?: string) => (f ? `/media/buttons/${f}` : undefined);
      return {
        src: toPath(file)!,
        name: base,
        downSrc: toPath(g.down),
        upSrc: toPath(g.up),
      };
    });
    return NextResponse.json({ items, success: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'LIST_FAILED' }, { status: 500 });
  }
}
