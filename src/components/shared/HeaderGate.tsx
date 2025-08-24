"use client";
import { usePathname } from 'next/navigation';
import GlobalHeader from './GlobalHeader';

export default function HeaderGate(){
  const pathname = usePathname();
  if(pathname === '/') return null;
  return <GlobalHeader />;
}
