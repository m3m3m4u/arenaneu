// Metadata Typ entfernt wegen fehlender next Typen in kompiliertem Setup
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Isostadt',
};

export default function Layout({ children }: { children: ReactNode }) {
  // Segment-Layout: umschließt die Isostadt-Seiten ohne <html>/<body>
  return <section>{children}</section>;
}
