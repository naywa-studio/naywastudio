/**
 * Le lien « ne plus me contacter », au bout de chaque message candidat.
 *
 * Route PUBLIQUE — c'est un destinataire qui l'ouvre, pas un utilisateur de
 * Naywa. Elle n'a donc ni session ni cookie, et le jeton signé est la seule
 * chose qui l'autorise.
 *
 * ── GET affiche, POST agit. Ce n'est pas un détail ───────────────────────
 *
 * Gmail et Outlook déclenchent `List-Unsubscribe-Post` en **POST**, sans
 * intervention humaine. Et des antivirus, des aperçus de lien et des filtres
 * anti-hameçonnage visitent les URL d'un message en **GET**, tout seuls.
 *
 * Si le GET désinscrivait, un candidat serait retiré à son insu par le
 * scanner de sa propre messagerie, sans avoir rien cliqué. Le sourceur ne
 * comprendrait jamais pourquoi il ne peut plus lui écrire.
 *
 * Le GET rend donc une page avec un bouton ; seul le POST écrit.
 */

import { NextRequest, NextResponse } from "next/server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { readUnsubscribeToken, hasUnsubscribeSecret } from "@/lib/mailing/unsubscribe"
import { suppressAddress } from "@/lib/mailing/suppression"

export const runtime = "nodejs"

/** Page minimale, sans dépendance ni style externe. */
function page(title: string, body: string, token?: string, status = 200): NextResponse {
  const form = token
    ? `<form method="post" action="/api/mailing/unsubscribe?t=${encodeURIComponent(token)}">
         <button type="submit">Confirmer</button>
       </form>`
    : ""
  return new NextResponse(
    `<!doctype html><html lang="fr"><head><meta charset="utf-8">
     <meta name="viewport" content="width=device-width,initial-scale=1">
     <title>${title}</title>
     <style>
       body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#FDFCF9;
            color:#1F2937;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}
       main{max-width:32rem;text-align:center}
       h1{font-size:1.25rem;margin:0 0 12px}
       p{line-height:1.6;color:#4B5563;margin:0 0 20px}
       button{background:#7C63C8;color:#fff;border:0;border-radius:10px;
              padding:12px 22px;font-size:15px;cursor:pointer;font-family:inherit}
     </style></head>
     <body><main><h1>${title}</h1><p>${body}</p>${form}</main></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  )
}

export async function GET(req: NextRequest) {
  /* Service non configuré ≠ lien invalide. Répondre « invalide » à un
   * destinataire dont le lien est parfaitement bon serait un mensonge — et
   * de l'extérieur, on ne pourrait plus distinguer les deux cas. */
  if (!hasUnsubscribeSecret()) {
    console.error("[mailing/unsubscribe] MAILING_UNSUBSCRIBE_SECRET absente")
    return page(
      "Service momentanément indisponible",
      "Nous ne pouvons pas traiter votre demande pour l'instant. Réessayez plus tard, ou répondez simplement au message.",
      undefined,
      503,
    )
  }

  const token = req.nextUrl.searchParams.get("t")
  const claim = readUnsubscribeToken(token)
  if (!claim) {
    return page("Lien invalide", "Ce lien de désinscription n'est plus valable.")
  }
  return page(
    "Ne plus être contacté",
    `Confirmez pour que cette organisation cesse de vous écrire à l'adresse <strong>${claim.email
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")}</strong>.`,
    token!,
  )
}

export async function POST(req: NextRequest) {
  /* Service non configuré ≠ lien invalide. Répondre « invalide » à un
   * destinataire dont le lien est parfaitement bon serait un mensonge — et
   * de l'extérieur, on ne pourrait plus distinguer les deux cas. */
  if (!hasUnsubscribeSecret()) {
    console.error("[mailing/unsubscribe] MAILING_UNSUBSCRIBE_SECRET absente")
    return page(
      "Service momentanément indisponible",
      "Nous ne pouvons pas traiter votre demande pour l'instant. Réessayez plus tard, ou répondez simplement au message.",
      undefined,
      503,
    )
  }

  const token = req.nextUrl.searchParams.get("t")
  const claim = readUnsubscribeToken(token)
  if (!claim) {
    return page("Lien invalide", "Ce lien de désinscription n'est plus valable.")
  }

  // Portée volontairement limitée à l'organisation : ce candidat refuse CE
  // cabinet, pas la plate-forme. Décider pour les autres serait décider à sa
  // place — cf. `lib/mailing/suppression.ts`.
  const ok = await suppressAddress(getAdminSupabase(), {
    email: claim.email,
    organizationId: claim.organizationId,
    reason: "unsubscribe",
    detail: "Demande du destinataire depuis le lien du message.",
  })

  if (!ok) {
    return page(
      "Réessayez dans un instant",
      "Nous n'avons pas pu enregistrer votre demande. Réessayez, ou répondez simplement au message pour la formuler.",
      token!,
    )
  }

  return page(
    "C'est noté",
    "Vous ne recevrez plus de message de cette organisation à cette adresse.",
  )
}
