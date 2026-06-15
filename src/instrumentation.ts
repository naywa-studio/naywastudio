/**
 * Next.js hook officiel pour initialiser Sentry par runtime.
 *
 * Next charge ce fichier au démarrage de chaque runtime (Node, Edge).
 * On délègue à la config Sentry adaptée. La config client est chargée
 * automatiquement par @sentry/nextjs via sentry.client.config.ts.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config")
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config")
  }
}
