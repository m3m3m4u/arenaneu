import dbConnect from '@/lib/db';
import User from '@/models/User';

// Usage:
//   npm run make:admin -- username
//   npm run make:admin -- --user=Kopernikus
//   (Default username=Kopernikus)
(async () => {
  const argv: string[] = (globalThis as any).process?.argv || [];
  const argUser = argv.slice(2).find((a: string)=>!a.startsWith('--')) || argv.slice(2).find((a: string)=>a.startsWith('--user='))?.split('=')[1];
  const username = argUser || 'Kopernikus';
  // Falls MONGODB_URI nicht gesetzt, versuche .env.local manuell einzulesen
  if(!process.env.MONGODB_URI){
    try {
      const fs = await import('fs');
      const path = await import('path');
  const envPath = path.join((process as any).cwd(), '.env.local');
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        for (const line of content.split(/\r?\n/)) {
          if(!line || line.trim().startsWith('#')) continue;
          const eq = line.indexOf('=');
          if(eq === -1) continue;
          const key = line.slice(0, eq).trim();
          let val = line.slice(eq+1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1,-1);
          }
          if (!process.env[key]) process.env[key] = val;
        }
        if(!process.env.MONGODB_URI){
          console.error('MONGODB_URI nicht in .env.local gefunden.');
        }
      }
    } catch(e){ /* ignore */ }
  }
  await dbConnect();
  const user = await User.findOne({ username });
  if (!user) {
    console.error(`User '${username}' nicht gefunden.`);
    try { (process as any).exit?.(1); } catch {}
    return;
  }
  if (user.role === 'admin') {
    console.log(`User '${username}' ist bereits admin.`);
    try { (process as any).exit?.(0); } catch {}
    return;
  }
  user.role = 'admin';
  await user.save();
  console.log(`User '${username}' wurde zu admin erhoben.`);
  try { (process as any).exit?.(0); } catch {}
})();
