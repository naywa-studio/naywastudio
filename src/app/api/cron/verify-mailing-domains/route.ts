/**
 * GET /api/cron/verify-mailing-domains — une fois par jour.
 *
 * ⚠️ **Une fois par jour, et pas plus, tant que le compte Vercel est en
 * Hobby.** Ce plan REFUSE au déploiement toute expression plus fréquente —
 * pas à l'exécution, au BUILD. Un `15 * * * *` a fait échouer le déploiement
 * du commit qui l'introduisait, et bloqué toute la chaîne derrière lui
 * pendant des heures sans que rien ne le dise clairement.
 *
 * Une fois par jour ne suffit évidemment pas à prévenir vite. La compensation
 * est ailleurs, et elle est meilleure : la page du contact technique
 * revérifie d'elle-même à chaque ouverture. **La personne qui attend est
 * celle qui rafraîchit** — ce cron n'est qu'un filet pour les cas où plus
 * personne ne regarde.
 *
 * Relit l'état des domaines en cours de mise en route, et PRÉVIENT quand l'un
 * devient actif.
 *
 * ── Le trou que ça bouche ────────────────────────────────────────────────
 *
 * Rien ne relisait l'état tant qu'un humain ne cliquait pas sur « Vérifier ».
 * Or depuis la délégation, **celui qui publie n'est pas celui qui attend** :
 * le prestataire pose les enregistrements, SES vérifie vingt minutes plus
 * tard, et le sourceur n'en sait rien. Il attend, puis appelle le support ou
 * renonce — alors que tout fonctionnait depuis la veille.
 *
 * ── Ce que ce cron déclenche aussi ───────────────────────────────────────
 *
 * `verifyAndPersist` bascule les adresses de réception au passage à `active`.
 * C'est la MÊME fonction que les deux chemins manuels : trois façons
 * d'activer un domaine, un seul effet.
 *
 * ── Volumétrie ───────────────────────────────────────────────────────────
 *
 * Un appel fournisseur par domaine EN COURS de mise en route — jamais pour
 * les domaines actifs, ni pour ceux qui n'ont rien déclaré. En pratique, une
 * poignée. Un plafond garde la main si ça devait grossir.
 *
 * Auth : Bearer CRON_SECRET.
 */

import { NextResponse, type NextRequest } from "next/server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { verifyCronSecret } from "@/lib/cron-auth"
import { verifyAndPersist } from "@/lib/mailing/verify-domain"
import { sendEmail, MAIL_DOMAIN } from "@/lib/resend"
import type { Organization } from "@/lib/database.types"

export const runtime = "nodejs"
export const maxDuration = 60

/** Au-delà, on laisse le passage suivant finir : mieux vaut un cron qui
 *  termine qu'un cron coupé au milieu par la limite de durée. */
const MAX_PER_RUN = 25

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const admin = getAdminSupabase()

  // Uniquement les domaines EN COURS : `active` n'a plus rien à apprendre, et
  // une org sans domaine déclaré n'a rien à vérifier.
  const { data: orgs, error } = await admin
    .from("organizations")
    .select("*")
    .not("mailing_sending_domain", "is", null)
    .neq("mailing_status", "active")
    .limit(MAX_PER_RUN)

  if (error) {
    console.error("[cron/verify-mailing] lecture impossible:", error.message)
    return NextResponse.json({ error: "read_failed" }, { status: 500 })
  }

  let checked = 0
  let activated = 0

  for (const org of (orgs ?? []) as Organization[]) {
    try {
      const out = await verifyAndPersist(admin, org)
      checked++
      if (!out.becameActive) continue
      activated++
      await notifyActivated(admin, org)
    } catch (err) {
      // Un domaine qui échoue ne doit pas arrêter les autres : le fournisseur
      // peut être momentanément indisponible, ou une identité avoir été
      // supprimée de son côté.
      console.error("[cron/verify-mailing] échec sur", org.mailing_sending_domain, err)
    }
  }

  return NextResponse.json({ ok: true, checked, activated })
}

/**
 * Prévient l'organisation que son domaine est prêt.
 *
 * Best-effort : le domaine EST actif, c'est le fait qui compte. Un email non
 * parti se rattrape au prochain passage dans la console ; annuler
 * l'activation parce qu'un email a échoué serait absurde.
 *
 * Le contact technique est prévenu aussi quand il y en a eu un : c'est lui
 * qui a fait le travail, et le laisser sans réponse est le meilleur moyen
 * qu'il ne réponde plus la prochaine fois.
 */
async function notifyActivated(
  admin: ReturnType<typeof getAdminSupabase>,
  org: Organization,
): Promise<void> {
  const { data: owner } = org.owner_user_id
    ? await admin.auth.admin.getUserById(org.owner_user_id)
    : { data: { user: null } }

  const to = owner?.user?.email
  const domain = org.mailing_sending_domain ?? ""
  const recipients = [to, org.mailing_delegate_email].filter(Boolean) as string[]

  for (const address of [...new Set(recipients)]) {
    try {
      await sendEmail({
        from: `Naywa Studio <contact@${MAIL_DOMAIN}>`,
        to: address,
        replyTo: `contact@${MAIL_DOMAIN}`,
        subject: `Votre domaine ${domain} est vérifié`,
        text: [
          `Bonjour,`,
          ``,
          `Les enregistrements DNS de ${domain} sont en place et le domaine`,
          `vient d'être vérifié.`,
          ``,
          `Vos messages aux candidats partent désormais de votre domaine, et`,
          `leurs réponses reviennent dans Naywa. Il n'y a plus rien à faire.`,
          ``,
          `— Naywa Studio`,
        ].join("\n"),
      })
    } catch (err) {
      console.error("[cron/verify-mailing] notification non envoyée:", address, (err as Error).message)
    }
  }
}
