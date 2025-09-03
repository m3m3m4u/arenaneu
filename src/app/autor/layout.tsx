import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSessionServer } from '@/lib/authOptions';

export default async function AutorLayout({ children }: { children: ReactNode }) {
  const session = await getSessionServer();
  // Nur Autor:innen und Admins dürfen ins Autorentool – Lehrpersonen explizit ausschließen
  if (!session?.user || (session.user.role !== 'author' && session.user.role !== 'admin')) {
    redirect('/login?error=not-author');
  }
  return (
    <div className="min-h-screen flex flex-col">
      <div className="bg-gray-50 border-b">
        <div className="mx-auto w-full max-w-6xl py-2 text-sm flex items-center">
          <a href="/dashboard" className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 hover:underline transition-colors">
            <span aria-hidden="true">←</span>
            <span>Startseite</span>
          </a>
        </div>
      </div>
  <div className="flex-1 mx-auto w-full max-w-6xl py-4">
        {children}
      </div>
    </div>
  );
}
