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
}

export default nextConfig
