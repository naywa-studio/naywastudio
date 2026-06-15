import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

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
      // /cabinet est renommée en /organisation (URL + UI). 301 pour
      // préserver les bookmarks et les liens dans les emails déjà
      // envoyés. Le matcher /:path* propage les sous-routes
      // (/cabinet/onboarding, /cabinet/parametrage).
      {
        source: '/cabinet',
        destination: '/organisation',
        permanent: true,
      },
      {
        source: '/cabinet/:path*',
        destination: '/organisation/:path*',
        permanent: true,
      },
    ]
  },
}

// Wrap avec Sentry. Si les env vars SENTRY_AUTH_TOKEN / SENTRY_ORG /
// SENTRY_PROJECT sont absents, le build continue normalement, juste
// sans upload de source maps (les erreurs en prod montreront du code
// minifié, ce qui reste mieux que rien). Activer le source map upload
// dès que tu auras créé ton projet Sentry et collé un auth token.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  // Tunnel route — contourne les bloqueurs de pubs qui filtrent les
  // requêtes vers ingest.sentry.io. Pas obligatoire mais évite des
  // trous dans les rapports d'erreurs côté client.
  tunnelRoute: '/monitoring',
  // Réduit la taille du bundle client en retirant les utilitaires Sentry
  // qui ne servent qu'au tracing (qu'on n'utilise pas en V1).
  disableLogger: true,
  // Pas d'upload de source maps si l'auth token n'est pas configuré.
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
})
