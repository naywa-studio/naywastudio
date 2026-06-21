/**
 * Liste centrale des zones de l'app que l'admin peut tagger sur une
 * nouveauté pour faire apparaître une pastille violette sur l'item
 * de menu correspondant.
 *
 * Une nouveauté sans paths = pastille globale "Nouveautés" uniquement
 * (comportement legacy).
 *
 * On matche par path exact côté UI (cf. useUnreadUpdates.affectedPaths) ;
 * pas de match préfixe — c'est volontaire pour que `/workspace` ne
 * matche pas `/workspace/vivier`. L'admin tague explicitement les
 * sous-pages s'il veut.
 */

export const AFFECTED_PATH_OPTIONS: { value: string; label: string; group: string }[] = [
  { value: "/workspace",          label: "Accueil",  group: "Workspace" },
  { value: "/workspace/vivier",   label: "Vivier",   group: "Workspace" },
  { value: "/workspace/missions", label: "Missions", group: "Workspace" },
  { value: "/workspace/pricing",  label: "Pricing",  group: "Workspace" },
  { value: "/workspace/pipeline", label: "Pipeline", group: "Workspace" },
  { value: "/organisation",       label: "Mon organisation", group: "Organisation" },
  { value: "/profil",             label: "Profil",   group: "Compte" },
]

export const VALID_AFFECTED_PATHS = new Set(AFFECTED_PATH_OPTIONS.map((o) => o.value))

/**
 * Filtre une liste arbitraire de paths à l'allowlist. Utilisé côté
 * API admin sur POST/PATCH pour ne jamais stocker un path inconnu.
 */
export function sanitizeAffectedPaths(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const out: string[] = []
  for (const v of input) {
    if (typeof v === "string" && VALID_AFFECTED_PATHS.has(v) && !out.includes(v)) {
      out.push(v)
    }
  }
  return out
}
