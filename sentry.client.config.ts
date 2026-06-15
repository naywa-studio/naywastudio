/**
 * Sentry — client SDK.
 *
 * Capture les erreurs qui se produisent dans le navigateur (composants
 * React, hooks, listeners) et les remonte au projet Sentry configuré
 * via SENTRY_DSN.
 *
 * Périmètre minimal V1 :
 *   - tracing désactivé (économie quota), seules les erreurs sont envoyées
 *   - replay désactivé (RGPD : on veut éviter de capturer des CVs candidats)
 *   - env distinguée production / preview via la variable Vercel
 *
 * À monter en puissance plus tard si besoin (perfs, sessions replay
 * masqué, etc.).
 */

import * as Sentry from "@sentry/nextjs"

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    // Pas de tracing pour économiser le quota free tier.
    tracesSampleRate: 0,
    // Pas de session replay — on traite des CVs candidats, on ne veut
    // rien capturer visuellement par défaut.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    // Filtre standard : ignore les erreurs courantes du navigateur qui
    // ne sont pas actionnables (extensions, network blip, etc.).
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      "Non-Error promise rejection captured",
      "Network request failed",
    ],
  })
}
