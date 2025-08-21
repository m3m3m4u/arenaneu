import NextAuth from 'next-auth';
import { authOptions } from '@/lib/authOptions';

// Use Pages API route for NextAuth to avoid App Router runtime quirks.
// Avoid typing to stay compatible with Next 15 API types changes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function auth(req: any, res: any) {
  return (NextAuth as any)(req, res, authOptions as any);
}
