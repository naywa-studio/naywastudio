/**
 * Helper post-login : retourne la bonne destination pour un user qui
 * vient de s'authentifier (login, magic-link, signup confirmé).
 *
 * Règles, dans l'ordre :
 *   1. Profil introuvable → /login (cas pathologique : trigger
 *      handle_new_auth_user() n'a pas tourné).
 *   2. Owner dont l'org n'a pas encore terminé l'onboarding cabinet
 *      → /onboarding (passe les 4 étapes Nom → Branding → Invites → Trial).
 *   3. Owner sans siège alloué → /organisation (il doit décider
 *      d'allouer un siège ou d'inviter quelqu'un). Évite la bounce
 *      /workspace → /organisation qu'on faisait avant.
 *   4. Sinon → /workspace.
 *
 * Les admins suivent la même logique : on garde leur expérience
 * cohérente avec les owners standards. Si tu te connectes en admin
 * sans siège, tu arrives sur /organisation. Le bypass admin
 * (TrialBanner, paywall) reste actif en arrière-plan.
 *
 * Appelé depuis /login (signInWithPassword + already-logged useEffect)
 * et /auth/callback (OAuth Google).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "./database.types"

const FALLBACK = "/workspace"

/** Liste blanche des destinations honorées si passées via ?next=. */
const ALLOWED_NEXT_PATHS = new Set([
  "/workspace",
  "/organisation",
  "/onboarding",
  "/profil",
  "/nouveautes",
  "/admin",
])

function sanitizeNext(rawNext: string | null | undefined): string | null {
  if (!rawNext) return null
  if (!rawNext.startsWith("/") || rawNext.startsWith("//")) return null
  // On accepte tout ce qui commence par un path autorisé (avec query
  // strings éventuels). Ça permet à /organisation?tab=abonnement de
  // passer sans qu'on ait à lister chaque sous-route.
  for (const prefix of ALLOWED_NEXT_PATHS) {
    if (rawNext === prefix || rawNext.startsWith(`${prefix}/`) || rawNext.startsWith(`${prefix}?`)) {
      return rawNext
    }
  }
  return null
}

/**
 * Résout la destination post-login en fonction du profil et de l'org.
 *
 * @param sb        Client Supabase auth (browser ou server)
 * @param userId    auth.users.id du user qui vient de se connecter
 * @param requestedNext  Valeur de `?next=` envoyée à /login, si présente
 */
export async function resolvePostLoginDestination(
  sb: SupabaseClient<Database>,
  userId: string,
  requestedNext?: string | null,
): Promise<string> {
  const { data: profile } = await sb
    .from("profiles")
    .select("role, has_sourcing_seat, organization_id")
    .eq("user_id", userId)
    .maybeSingle()

  if (!profile) {
    // Profil pas encore créé (trigger en retard). On laisse le proxy
    // gérer — /workspace re-redirigera si nécessaire.
    return sanitizeNext(requestedNext) ?? FALLBACK
  }

  // Owner sans onboarding terminé : aller à l'onboarding (le layout
  // /organisation pousse aussi vers /onboarding, mais autant éviter
  // la bounce).
  if (profile.role === "owner") {
    const { data: org } = await sb
      .from("organizations")
      .select("cabinet_onboarded_at")
      .eq("id", profile.organization_id)
      .maybeSingle()
    if (!org?.cabinet_onboarded_at) {
      return "/onboarding"
    }
    if (!profile.has_sourcing_seat) {
      // Owner sans siège : on l'envoie sur la console organisation
      // pour qu'il décide d'allouer un siège ou d'inviter un membre.
      // Toute requête ?next= explicite reste honorée si valide.
      return sanitizeNext(requestedNext) ?? "/organisation"
    }
  }

  // Member ou owner avec siège : ?next= ou /workspace par défaut.
  return sanitizeNext(requestedNext) ?? FALLBACK
}
