/**
 * Next.js hook officiel pour initialiser Sentry par runtime.
 *
 * Next charge ce fichier au démarrage de chaque runtime (Node, Edge). On
 * délègue à la config Sentry adaptée. La config CLIENT (navigateur) vit dans
 * `instrumentation-client.ts` (requis par Turbopack — l'ancien
 * `sentry.client.config.ts` n'y est PAS chargé).
 */

import * as Sentry from "@sentry/nextjs"

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config")
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config")
  }
}

/**
 * Capture les erreurs levées dans les Server Components et les route handlers
 * imbriqués (hook Next 15+). Sans ça, certaines erreurs RSC échappent au SDK
 * serveur.
 */
export const onRequestError = Sentry.captureRequestError
