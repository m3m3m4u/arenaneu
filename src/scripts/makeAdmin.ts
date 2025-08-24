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
