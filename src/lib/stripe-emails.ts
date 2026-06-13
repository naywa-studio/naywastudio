/**
 * Transactional emails sent after Stripe events.
 *
 * Templates are intentionally minimal — short text, single CTA, no
 * marketing copy. We're acknowledging a billing event, not nurturing.
 *
 * From / Reply-To :
 *   - From : "Naywa Studio <facturation@mail.naywastudio.com>"  ← transactional
 *   - Reply-To : "contact@naywastudio.com"                       ← humans
 *
 * Failures are caught and logged — we never want a Resend hiccup to
 * make Stripe retry the webhook in a loop.
 */

import { sendEmail } from "./resend"

const FROM = "Naywa Studio <facturation@mail.naywastudio.com>"
const REPLY_TO = "contact@naywastudio.com"
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://naywastudio.com"

/* ── Wrapper HTML générique ─────────────────────────────────────── */

function wrap({ heading, body, ctaLabel, ctaUrl }: {
  heading: string
  body: string
  ctaLabel?: string
  ctaUrl?: string
}): string {
  // CSS inline parce que les clients mail rejettent <style> isolés.
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FAFAFA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAFA;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:white;border-radius:16px;padding:36px 32px;box-shadow:0 1px 3px rgba(17,24,39,0.04);">
        <tr><td>
          <div style="font-size:14px;font-weight:700;color:#7C63C8;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:14px;">
            Naywa Studio
          </div>
          <h1 style="margin:0 0 14px;font-size:22px;font-weight:800;color:#111827;letter-spacing:-0.01em;line-height:1.25;">
            ${heading}
          </h1>
          <div style="font-size:15px;line-height:1.6;color:#374151;">
            ${body}
          </div>
          ${ctaLabel && ctaUrl ? `
          <div style="margin-top:24px;">
            <a href="${ctaUrl}" style="display:inline-block;background:#7C63C8;color:white;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:14px;font-weight:700;">
              ${ctaLabel}
            </a>
          </div>` : ""}
          <hr style="margin:28px 0 16px;border:none;border-top:1px solid #F0ECF8;">
          <p style="margin:0;font-size:12px;color:#9CA3AF;line-height:1.5;">
            Une question ? Répondez simplement à ce mail, on vous lit.
            <br>Naywa Studio — Micro-entreprise (Elyas Malki)
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

/* ── Templates ──────────────────────────────────────────────────── */

export async function sendSubscriptionWelcome(opts: {
  to: string
  firstName: string | null
  planLabel: string
  seats: number
}): Promise<void> {
  const greeting = opts.firstName?.trim() ? `Bonjour ${opts.firstName.trim()},` : "Bonjour,"
  const seatsLabel = `${opts.seats} siège${opts.seats > 1 ? "s" : ""}`
  const text = `${greeting}

Votre abonnement ${opts.planLabel} (${seatsLabel}) est actif.
Vous pouvez accéder à votre workspace dès maintenant :
${APP_URL}/workspace

Vous recevrez chaque mois une facture par email, automatiquement.
Vous pouvez gérer votre abonnement (moyens de paiement, factures,
annulation) depuis votre console :
${APP_URL}/organisation

Une question ? Répondez simplement à ce mail.

— L'équipe Naywa Studio`

  const html = wrap({
    heading: `Bienvenue sur ${opts.planLabel}`,
    body: `<p>${greeting}</p>
<p>Votre abonnement <strong>${opts.planLabel}</strong> (${seatsLabel}) est actif. Vous pouvez accéder à votre workspace dès maintenant.</p>
<p style="color:#6B7280;font-size:13.5px;">Vous recevrez chaque mois une facture par email, automatiquement. La gestion de votre abonnement reste accessible à tout moment depuis votre console.</p>`,
    ctaLabel: "Ouvrir mon workspace",
    ctaUrl: `${APP_URL}/workspace`,
  })

  try {
    await sendEmail({
      from: FROM,
      to: opts.to,
      replyTo: REPLY_TO,
      subject: `Bienvenue sur ${opts.planLabel}`,
      text,
      html,
    })
  } catch (err) {
    console.error("[stripe-emails] sendSubscriptionWelcome failed:", err)
  }
}

export async function sendPaymentFailed(opts: {
  to: string
  firstName: string | null
  amountEur: number
}): Promise<void> {
  const greeting = opts.firstName?.trim() ? `Bonjour ${opts.firstName.trim()},` : "Bonjour,"
  const amountFr = opts.amountEur.toFixed(2).replace(".", ",")
  const text = `${greeting}

Le prélèvement de ${amountFr} € pour votre abonnement Naywa Studio a échoué.

Pour éviter une coupure d'accès, mettez à jour votre moyen de paiement
depuis votre console :
${APP_URL}/organisation

Si vous avez une question, répondez simplement à ce mail.

— L'équipe Naywa Studio`

  const html = wrap({
    heading: "Échec du prélèvement",
    body: `<p>${greeting}</p>
<p>Le prélèvement de <strong>${amountFr} €</strong> pour votre abonnement Naywa Studio a échoué.</p>
<p>Pour éviter une coupure d'accès, mettez à jour votre moyen de paiement depuis votre console.</p>`,
    ctaLabel: "Mettre à jour mon moyen de paiement",
    ctaUrl: `${APP_URL}/organisation`,
  })

  try {
    await sendEmail({
      from: FROM,
      to: opts.to,
      replyTo: REPLY_TO,
      subject: "Échec du prélèvement — Naywa Studio",
      text,
      html,
    })
  } catch (err) {
    console.error("[stripe-emails] sendPaymentFailed failed:", err)
  }
}

export async function sendLockdownNotice(opts: {
  to: string
  firstName: string | null
  role: "owner" | "member"
}): Promise<void> {
  const greeting = opts.firstName?.trim() ? `Bonjour ${opts.firstName.trim()},` : "Bonjour,"
  const isOwner = opts.role === "owner"

  const ownerBody = `${greeting}

L'abonnement de votre cabinet Naywa Studio est suspendu : le dernier
prélèvement a échoué ou l'abonnement a été annulé.

Votre workspace passe en lecture seule pendant 15 jours. Pendant cette
période vous pouvez consulter vos données, mais plus les modifier. Au
terme des 15 jours, les données du cabinet seront supprimées.

Pour reprendre l'accès complet, mettez à jour votre moyen de paiement
ou souscrivez à nouveau depuis votre console :
${APP_URL}/organisation

Vous pouvez aussi télécharger un export complet de vos données depuis
l'onglet Sécurité.

— L'équipe Naywa Studio`

  const memberBody = `${greeting}

L'abonnement du cabinet auquel vous appartenez est suspendu. Le
workspace passe en lecture seule pendant 15 jours, puis les données
seront supprimées.

Demandez à l'owner du cabinet de régulariser. Vous pouvez aussi
exporter vos données depuis l'onglet Sécurité de votre console :
${APP_URL}/organisation?tab=securite

— L'équipe Naywa Studio`

  const text = isOwner ? ownerBody : memberBody

  const html = wrap({
    heading: "Workspace en lecture seule",
    body: `<p>${greeting}</p>
<p>${isOwner
        ? "L'abonnement de votre cabinet Naywa Studio est suspendu. Votre workspace passe en <strong>lecture seule pendant 15 jours</strong>, puis les données seront supprimées."
        : "L'abonnement du cabinet auquel vous appartenez est suspendu. Le workspace passe en <strong>lecture seule pendant 15 jours</strong>, puis les données seront supprimées."}
</p>
<p style="color:#6B7280;font-size:13.5px;">
  ${isOwner
        ? "Pour reprendre l'accès complet, mettez à jour votre moyen de paiement ou souscrivez à nouveau."
        : "Demandez à l'owner du cabinet de régulariser. En attendant, vous pouvez exporter vos données."}
</p>`,
    ctaLabel: isOwner ? "Régulariser mon abonnement" : "Exporter mes données",
    ctaUrl: isOwner ? `${APP_URL}/organisation` : `${APP_URL}/organisation?tab=securite`,
  })

  try {
    await sendEmail({
      from: FROM,
      to: opts.to,
      replyTo: REPLY_TO,
      subject: "Workspace Naywa Studio en lecture seule",
      text,
      html,
    })
  } catch (err) {
    console.error("[stripe-emails] sendLockdownNotice failed:", err)
  }
}

export async function sendTrialEndingSoon(opts: {
  to: string
  firstName: string | null
  daysLeft: number
}): Promise<void> {
  const greeting = opts.firstName?.trim() ? `Bonjour ${opts.firstName.trim()},` : "Bonjour,"
  const days = `${opts.daysLeft} jour${opts.daysLeft > 1 ? "s" : ""}`
  const text = `${greeting}

Votre période d'essai Naywa Studio se termine dans ${days}.

Pour continuer sans coupure, souscrivez au Package Sourcing depuis
votre console :
${APP_URL}/organisation

Une question ? Répondez simplement à ce mail.

— L'équipe Naywa Studio`

  const html = wrap({
    heading: `Votre essai se termine dans ${days}`,
    body: `<p>${greeting}</p>
<p>Votre période d'essai Naywa Studio se termine dans <strong>${days}</strong>. Pour continuer sans coupure, souscrivez au Package Sourcing depuis votre console.</p>`,
    ctaLabel: "Souscrire au Package Sourcing",
    ctaUrl: `${APP_URL}/organisation`,
  })

  try {
    await sendEmail({
      from: FROM,
      to: opts.to,
      replyTo: REPLY_TO,
      subject: `Votre essai Naywa se termine dans ${days}`,
      text,
      html,
    })
  } catch (err) {
    console.error("[stripe-emails] sendTrialEndingSoon failed:", err)
  }
}
