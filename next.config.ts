import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Native / large server-only modules must not be bundled by the client or the
  // server compiler.
  serverExternalPackages: ['better-sqlite3', 'pdfjs-dist', 'tesseract.js'],
  experimental: {
    // Uploads are capped at UPLOAD_MAX_BYTES (8 MB) in src/lib/documents.ts.
    serverActions: { bodySizeLimit: '10mb' },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
