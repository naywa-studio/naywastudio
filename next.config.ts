import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  compress: true,
  reactCompiler: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'prod.spline.design',
      },
    ],
  },
}

export default nextConfig
