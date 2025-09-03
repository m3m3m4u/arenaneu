import type { NextConfig } from "next";

// Optional: Host für externe Medien (Hetzner WebDAV/CDN)
const webdavBase = process.env.WEBDAV_PUBLIC_BASEURL || process.env.WEBDAV_BASEURL;
let webdavHost: string | undefined;
try {
  if (webdavBase) webdavHost = new URL(webdavBase).hostname;
} catch {}

// Dynamische Security Header (CSP in Preview etwas lockern für vercel.live Feedback Script)
const securityHeaders = (() => {
  const isPreview = process.env.VERCEL === '1' && process.env.VERCEL_ENV === 'preview';
  const imgSrc = ["img-src 'self'", 'data:', 'blob:', 'https://blob.vercel-storage.com'];
  const mediaSrc = ["media-src 'self'", 'blob:', 'https://blob.vercel-storage.com'];
  if (webdavHost) {
    imgSrc.push(`https://${webdavHost}`);
    mediaSrc.push(`https://${webdavHost}`);
  }
  const scriptSrcParts = ["'self'", "'unsafe-inline'", "'unsafe-eval'"]; // aktuelle Basis (kann später gehärtet werden)
  if (isPreview) {
    // vercel.live wird nur in Preview benötigt für Feedback / Live Overlay
    scriptSrcParts.push('https://vercel.live');
  }
  const connectSrcParts = ["'self'"];
  if (isPreview) connectSrcParts.push('https://vercel.live');
  const csp = [
    "default-src 'self'",
    `script-src ${scriptSrcParts.join(' ')}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    imgSrc.join(' '),
    "font-src 'self' https://fonts.gstatic.com",
  `frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://youtu.be${isPreview ? ' https://vercel.live' : ''}`,
    mediaSrc.join(' '),
    `connect-src ${connectSrcParts.join(' ')}`,
  ].join('; ');
  return [
    { key: 'X-DNS-Prefetch-Control', value: 'on' },
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    { key: 'X-XSS-Protection', value: '1; mode=block' },
    { key: 'Content-Security-Policy', value: csp }
  ];
})();

const nextConfig: NextConfig = {
  output: 'standalone', // kleinere Lambda bundles (Vercel / Docker)
  // Sorgt dafür, dass @vercel/blob trotz dynamischem Import in /api/media mit in das Standalone-Bundle aufgenommen wird
  outputFileTracingIncludes: {
    '/api/media': [
      'node_modules/@vercel/blob/**',
  'node_modules/undici/**',
  'node_modules/async-retry/**',
  'node_modules/bytes/**',
  'node_modules/is-plain-object/**',
  'node_modules/is-buffer/**',
  'node_modules/@fastify/busboy/**',
  // no explicit webdav client dependency anymore
    ]
  },
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  experimental: {
    optimizePackageImports: ['react', 'react-dom']
  },
  // Unterdrückt gezielt die harmlosen Warnings durch den absichtlich dynamischen Import in /api/media
  webpack: (config: any) => {
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
      { protocol: 'https', hostname: 'blob.vercel-storage.com' },
      ...(webdavHost ? [{ protocol: 'https' as const, hostname: webdavHost }] : [])
    ]
  }
};

export default nextConfig;
