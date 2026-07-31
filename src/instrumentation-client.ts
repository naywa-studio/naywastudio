/**
 * Sentry — SDK client (navigateur).
 *
 * Next 16 + Turbopack ne chargent PAS l'ancien `sentry.client.config.ts` :
 * l'entrée client officielle est CE fichier (`instrumentation-client.ts`).
 * Sans lui, aucune erreur navigateur (composants React, hooks, listeners)
 * ne remonterait à Sentry — d'où le « ça ne se branche pas ».
 *
 * Périmètre minimal V1 :
 *   - erreurs seules, tracing désactivé (économie quota free tier) ;
 *   - session replay désactivé (RGPD : on traite des CV candidats, on ne
 *     veut rien capturer visuellement par défaut) ;
 *   - environnement distingué production / preview via la variable Vercel
 *     exposée au client (NEXT_PUBLIC_VERCEL_ENV).
 */

import * as Sentry from "@sentry/nextjs"

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    // Pas de tracing (quota) ni de replay (RGPD) en V1.
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    // Bruits navigateur non actionnables (extensions, coupures réseau, etc.).
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      "Non-Error promise rejection captured",
      "Network request failed",
    ],
  })
}
