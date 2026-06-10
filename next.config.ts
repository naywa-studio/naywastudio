import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  compress: true,
  reactCompiler: true,
  serverExternalPackages: ['node-ssh', 'ssh2'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'prod.spline.design',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
  // Force the canonical domain. Vercel serves the app on both the auto
  // `nawa-studio.vercel.app` alias and the custom `naywastudio.com` —
  // any hit on the .vercel.app host gets a permanent 301 to the .com,
  // so old bookmarks and OAuth round-trips end up on the brand domain.
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'nawa-studio.vercel.app' }],
        destination: 'https://naywastudio.com/:path*',
        permanent: true,
      },
      // L'ancienne page /comment-ca-marche a fusionné avec /solutions.
      // 301 propre pour préserver le SEO et les liens externes.
      {
        source: '/comment-ca-marche',
        destination: '/solutions',
        permanent: true,
      },
    ]
  },
}

export default nextConfig
