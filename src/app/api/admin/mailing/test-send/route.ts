/**
 * GET /api/admin/mailing/test-send?to=…&confirm=send-real-email
 *
 * ⚠️ CETTE ROUTE ENVOIE UN VRAI EMAIL. Admin-only, temporaire, à retirer avec
 * la route de diagnostic une fois le lot mailing en production.
 *
 * Elle existe pour prouver la promesse centrale de la fonctionnalité : un
 * message part RÉELLEMENT depuis le domaine du cabinet, signé, et arrive. Tant
 * qu'on ne l'a pas vu arriver, on ne sait pas si SES accepte notre en-tête
 * From — le reste du chantier reposerait sur une supposition.
 *
 * ── Pourquoi un paramètre de confirmation ────────────────────────────────
 *
 * Un GET ne devrait jamais avoir d'effet de bord. Ici c'est un compromis
 * assumé : coller une URL dans un navigateur est le seul moyen simple
 * d'atteindre une route protégée par session. Le paramètre `confirm` empêche
 * qu'une préconnexion du navigateur, un aperçu de lien ou un rechargement
 * distrait ne déclenche un envoi.
 *
 * ── Bac à sable ──────────────────────────────────────────────────────────
 *
 * Tant que l'accès production n'est pas accordé, le destinataire DOIT être une
 * identité vérifiée dans SES. Sinon SES refuse — et `explainSesError` traduit
 * son message, qui n'oriente vers rien.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin"
import { activeProvider } from "@/lib/mailing/send"
import { candidateFromHeader } from "@/lib/mailing/send"
import { explainSesError } from "@/lib/mailing/ses"

export const runtime = "nodejs"

const TEST_DOMAIN = "careers-test.naywastudio.com"

export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.response

  const to = (req.nextUrl.searchParams.get("to") ?? "").trim()
  const confirm = (req.nextUrl.searchParams.get("confirm") ?? "").trim()

  if (confirm !== "send-real-email") {
    return NextResponse.json({
      ok: false,
      message:
        "Aucun email envoyé. Ajoutez « &confirm=send-real-email » pour déclencher " +
        "un envoi RÉEL — la confirmation évite qu'un rechargement ou une " +
        "préconnexion du navigateur n'envoie un message.",
    }, { status: 200 })
  }
  if (!to || !to.includes("@")) {
    return NextResponse.json({
      ok: false,
      message: "Paramètre « to » manquant ou invalide.",
    }, { status: 400 })
  }

  const from = `careers@${TEST_DOMAIN}`

  try {
    const { id } = await activeProvider().sendFromDomain({
      // On passe par le MÊME constructeur d'en-tête que l'envoi candidat, pas
      // par une chaîne écrite à la main : ce test doit exercer le code réel,
      // filtrage d'injection compris, sinon il ne prouve rien.
      from: candidateFromHeader("Naywa — test technique", from),
      to,
      replyTo: to,
      subject: "Test technique Naywa — envoi depuis le domaine du cabinet",
      text: [
        "Ceci est un test technique.",
        "",
        `Ce message a été envoyé depuis ${from}, un domaine vérifié dans Amazon SES`,
        "(région eu-west-1, données en Europe).",
        "",
        "Ce qu'il prouve, s'il vous parvient :",
        "  · les identifiants et la politique IAM fonctionnent ;",
        "  · SES accepte l'en-tête d'expéditeur construit par le produit ;",
        "  · le message est signé DKIM par le domaine et il est délivré.",
        "",
        "Vérifiez dans le détail du message que la signature DKIM correspond bien",
        "au domaine expéditeur, et non à un domaine Naywa.",
      ].join("\n"),
    })

    return NextResponse.json({
      ok: true,
      messageId: id,
      from,
      to,
      next:
        "Ouvrez le message reçu et affichez « Afficher l'original » : la ligne " +
        "DKIM doit porter d=" + TEST_DOMAIN + ". C'est ce qui prouve que le mail " +
        "est signé par le domaine du cabinet et non par Naywa.",
    }, { status: 200 })
  } catch (err) {
    return NextResponse.json({
      ok: false,
      message: explainSesError(err),
    }, { status: 200 })
  }
}
