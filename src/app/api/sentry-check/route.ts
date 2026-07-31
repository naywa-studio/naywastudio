/**
 * Route TEMPORAIRE de vérification Sentry (source maps). À SUPPRIMER après test.
 * GET → lève une exception à la ligne 9, qui doit apparaître LISIBLE dans Sentry
 * (src/app/api/sentry-check/route.ts:9) une fois les source maps uploadées.
 */

export const runtime = "nodejs"

export async function GET() {
  throw new Error("Sentry source maps check — erreur test volontaire (ignorer)")
}
