import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import dbConnect from "@/lib/db";
import User, { IUser } from "@/models/User";
import { compare } from "bcryptjs";
import { getServerSession } from 'next-auth/next';

export const authOptions: NextAuthOptions = {
  // Wichtig: Secret explizit setzen, sonst kann getToken() in Produktions-Umgebungen (Edge/Route) den JWT nicht verifizieren
  // und liefert null. In Produktion MUSS NEXTAUTH_SECRET gesetzt sein.
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Benutzername", type: "text" },
        password: { label: "Passwort", type: "password" },
      },
      async authorize(credentials) {
        const wantUser = String(credentials?.username || '');
        const wantPass = String(credentials?.password || '');
  // Demo-Login jetzt nur noch explizit über ENV Flag aktivierbar
  const allowDemo = process.env.ENABLE_DEMO_LOGIN === '1';
        const hasDb = !!process.env.MONGODB_URI;
        // Dev-Shortcut: Wenn keine DB konfiguriert ist, optional Demo-Login zulassen
        if (!hasDb && allowDemo) {
          if (wantUser === 'Kopernikus' && wantPass === '12345') {
            return { id: 'demo', name: 'Kopernikus', username: 'Kopernikus', role: 'admin' } as unknown as any;
          }
          throw new Error('Datenbank nicht konfiguriert (MONGODB_URI). Für Demo-Login: Benutzer "Kopernikus" / Passwort "12345" verwenden.');
        }
        try {
          await dbConnect();
    } catch (e) {
          if (allowDemo && wantUser === 'Kopernikus' && wantPass === '12345') {
      return { id: 'demo', name: 'Kopernikus', username: 'Kopernikus', role: 'admin' } as unknown as any;
          }
          throw e;
        }
  const user = await User.findOne({ username: credentials?.username });
        if (!user) { console.warn('[auth] user not found', credentials?.username); throw new Error("Benutzer nicht gefunden"); }
        if (!credentials?.password) throw new Error("Passwort fehlt");
        const isValid = await compare(credentials.password, user.password);
        if (!isValid) { console.warn('[auth] invalid password for', credentials?.username); throw new Error("Falsches Passwort"); }
  const uDoc = user as unknown as IUser;
  const id = uDoc?._id ? String(uDoc._id) : (user.id ? String(user.id) : undefined);
  const rawRole = uDoc?.role ? String(uDoc.role) : 'learner';
        // pending-author hat noch keine Rechte wie author
        return {
          id,
          name: uDoc?.name,
          username: uDoc?.username,
          role: rawRole
        } as unknown as any; // NextAuth v4 erwartet ein User-ähnliches Objekt
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as { id?: string; username?: string; name?: string; role?: string };
        if (u.id) (token as Record<string, unknown>).id = u.id;
        if (u.username) (token as Record<string, unknown>).username = u.username;
        if (u.name) token.name = u.name;
        if (u.role) {
          // pending-teacher sofort hochstufen
          if (u.role === 'pending-teacher') {
            (token as Record<string, unknown>).role = 'teacher';
            // Best effort Persistierung
            if (u.username) {
              try { await dbConnect(); await User.updateOne({ username: u.username, role: 'pending-teacher' }, { $set: { role: 'teacher' } }); } catch { /* ignore */ }
            }
          } else {
            (token as Record<string, unknown>).role = u.role;
          }
        }
      }
  // Keine Username-Eskalation mehr: Admin-Rechte kommen ausschließlich aus der Datenbank (role Feld)
      return token;
    },
    async session({ session, token }) {
      if (session?.user) {
        const t = token as { id?: string; sub?: string; username?: string; name?: string; role?: 'learner' | 'author' | 'teacher' | 'admin' | 'pending-author' | 'pending-teacher' };
        session.user = {
          ...session.user,
          ...(t.id ? { id: t.id } : (t.sub ? { id: String(t.sub) } : {})),
          ...(t.username ? { username: t.username } : {}),
          ...(t.name ? { name: t.name } : {}),
          ...(t.role ? { role: t.role } : {})
        } as typeof session.user;
      }
      return session;
    },
  },
};

export async function getSessionServer() { return getServerSession(authOptions); }
