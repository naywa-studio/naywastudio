/**
 * Route TEMPORAIRE de vérification du pipeline Sentry. À SUPPRIMER après le test.
 * GET → lève une exception non gérée, qui doit remonter dans Sentry (projet
 * javascript-nextjs). Aucun effet de bord, aucune donnée touchée.
 */

export const runtime = "nodejs"

export async function GET() {
  throw new Error("Sentry wiring check — erreur test volontaire (ignorer)")
}
