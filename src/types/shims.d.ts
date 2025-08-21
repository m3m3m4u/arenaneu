// Minimal shims to satisfy TypeScript in environments without full Node/Next typings installed.
declare module 'next/server' {
  export const NextRequest: any;
  export const NextResponse: any;
}
declare module 'next-auth/next' {
  export const getServerSession: any;
}
declare module 'next' {
  export type NextConfig = any;
}
declare module 'fs' { const x: any; export = x; }
declare module 'fs/promises' { const x: any; export = x; }
declare module 'path' { const x: any; export = x; }
