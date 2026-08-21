/**
 * GET /api/admin/mailing/diagnose?domain=…
 *
 * Diagnostic du socle mailing. Admin-only, LECTURE SEULE : interroge le
 * fournisseur d'envoi et renvoie ce qu'il répond, sans rien créer ni modifier.
 *
 * Pourquoi une route plutôt qu'un script : les identifiants AWS vivent dans
 * l'environnement Vercel, jamais sur un poste. Le seul moyen honnête de
 * vérifier que la configuration fonctionne, c'est de l'exercer là où elle
 * tourne — et de lire la réponse réelle du fournisseur, pas une simulation.
 *
 * Elle répond à quatre questions, dans l'ordre où elles échouent en pratique :
 *   1. les variables d'environnement sont-elles présentes ?
 *   2. les identifiants sont-ils acceptés (politique IAM correcte) ?
 *   3. l'identité existe-t-elle DANS CETTE RÉGION ?
 *   4. quel est son état, et que reste-t-il à publier ?
 *
 * À retirer une fois le lot mailing en production : un point de diagnostic qui
 * survit à son chantier finit par être appelé par autre chose.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin"
import { activeProvider } from "@/lib/mailing/send"
import { explainSesError } from "@/lib/mailing/ses"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.response

  const domain = (req.nextUrl.searchParams.get("domain") ?? "").trim()
    || "careers-test.naywastudio.com"

  // Présence des variables, sans jamais renvoyer leur valeur. On expose les
  // 4 premiers caractères de l'identifiant (public, non secret) pour vérifier
  // d'un coup d'œil que Vercel sert bien la clé attendue — un copier-coller
  // tronqué produit sinon un « AccessDenied » incompréhensible.
  const keyId = (process.env.AWS_SES_ACCESS_KEY_ID ?? "").trim()
  const topicArn = (process.env.AWS_SNS_INBOUND_TOPIC_ARN ?? "").trim()
  const env = {
    AWS_SES_ACCESS_KEY_ID: keyId ? `${keyId.slice(0, 4)}… (${keyId.length} car.)` : "MANQUANTE",
    AWS_SES_SECRET_ACCESS_KEY: (process.env.AWS_SES_SECRET_ACCESS_KEY ?? "").trim()
      ? "présente" : "MANQUANTE",
    AWS_SES_REGION: (process.env.AWS_SES_REGION ?? "").trim() || "(défaut eu-west-1)",
    // Rubrique SNS attendue par la route de réception. Affichée en clair : un
    // ARN est un identifiant, pas un secret — et le voir permet de repérer
    // d'un coup d'œil une faute de frappe ou une mauvaise région, qui feraient
    // sinon échouer la confirmation d'abonnement sans explication.
    AWS_SNS_INBOUND_TOPIC_ARN: topicArn || "MANQUANTE — la réception refusera tout",
  }

  if (env.AWS_SES_ACCESS_KEY_ID === "MANQUANTE" || env.AWS_SES_SECRET_ACCESS_KEY === "MANQUANTE") {
    return NextResponse.json({
      ok: false,
      step: "env",
      message: "Variables d'environnement AWS absentes de ce déploiement.",
      env,
    }, { status: 200 })
  }

  try {
    const found = await activeProvider().getSendingDomain(domain)

    if (!found) {
      return NextResponse.json({
        ok: false,
        step: "identity",
        message:
          `Les identifiants fonctionnent, mais aucune identité « ${domain} » dans ` +
          `cette région. Les identités SES sont vérifiées PAR RÉGION.`,
        env,
        provider: activeProvider().name,
      }, { status: 200 })
    }

    return NextResponse.json({
      ok: true,
      step: "done",
      env,
      provider: activeProvider().name,
      domain: found.name,
      status: found.status,
      canSend: found.status === "active",
      // Vide quand le domaine est vérifié : plus rien à publier.
      recordsToPublish: found.records,
    }, { status: 200 })
  } catch (err) {
    // `explainSesError` traduit les deux échecs les plus coûteux à
    // diagnostiquer : politique IAM insuffisante, et région erronée.
    return NextResponse.json({
      ok: false,
      step: "provider",
      message: explainSesError(err),
      env,
    }, { status: 200 })
  }
}
