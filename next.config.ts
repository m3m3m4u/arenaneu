import type { NextConfig } from "next";

const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Content-Security-Policy', value: [
      "default-src 'self'",
      // Next.js dev benötigt teils eval; in Prod ggf. strenger machen
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https://blob.vercel-storage.com",
      "font-src 'self' https://fonts.gstatic.com",
      // YouTube Embeds
      "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://youtu.be",
      // Für Media Blob URLs (z. B. @vercel/blob signed URLs)
  "media-src 'self' blob: https://blob.vercel-storage.com",
      // Connect für API/Blob ggf. erweitern
      "connect-src 'self'",
    ].join('; ') }
];

const nextConfig: NextConfig = {
  output: 'standalone', // kleinere Lambda bundles (Vercel / Docker)
  // Sorgt dafür, dass @vercel/blob trotz dynamischem Import in /api/media mit in das Standalone-Bundle aufgenommen wird
  outputFileTracingIncludes: {
    '/api/media': ['node_modules/@vercel/blob/**']
  },
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  experimental: {
    optimizePackageImports: ['react', 'react-dom']
  },
  // Unterdrückt gezielt die harmlosen Warnings durch den absichtlich dynamischen Import in /api/media
  webpack: (config) => {
    const prev = config.ignoreWarnings || [];
    config.ignoreWarnings = [
      ...prev,
      (warning: any) => {
        try {
          const msg: string = warning?.message || '';
          const mod: string = warning?.module?.resource || '';
          return msg.includes('Critical dependency: the request of a dependency is an expression')
            && /[\\\/]src[\\\/]app[\\\/]api[\\\/]media[\\\/]route\.(t|j)s$/.test(mod);
        } catch {
          return false;
        }
      }
    ];
    return config;
  },
  async headers() {
    return [
      { source: '/(.*)', headers: securityHeaders }
    ];
  },
  // Images optional konfigurieren (erweitern falls externe Domains genutzt)
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'i.ytimg.com' },
      { protocol: 'https', hostname: 'blob.vercel-storage.com' }
    ]
  }
};

export default nextConfig;
