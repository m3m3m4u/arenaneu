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
	<div className="flex-1 mx-auto w-full max-w-6xl py-4">
        {children}
      </div>
    </div>
  );
}
