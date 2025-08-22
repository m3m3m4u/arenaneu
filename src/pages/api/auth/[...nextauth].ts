import NextAuth from 'next-auth';
import { authOptions } from '@/lib/authOptions';

// Zentrale (einzige) NextAuth-Route über Pages Router.
// WICHTIG: Keine parallele App Router Implementierung unter
//   src/app/api/auth/[...nextauth]/route.ts
// anlegen, sonst meldet Next einen Konflikt.
// Falls später Migration auf App Router gewünscht: Diese Datei löschen
// und erst dann eine route.ts erzeugen.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function auth(req: any, res: any) {
	return (NextAuth as any)(req, res, authOptions as any);
}
