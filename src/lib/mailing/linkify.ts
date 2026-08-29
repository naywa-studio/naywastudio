/**
 * Rendre cliquables les liens d'un message, sans jamais rendre de HTML.
 *
 * ── Pourquoi on ne rend PAS le `body_html` reçu ──────────────────────────
 *
 * Un email entrant est du contenu écrit par un inconnu. L'afficher en HTML,
 * c'est exécuter son balisage dans la page d'un sourceur connecté. On rend
 * donc le texte brut — et on le rend cliquable nous-mêmes, à partir de
 * segments qu'on a produits, jamais d'une chaîne qu'on interpole.
 *
 * ── Le motif `libellé<url>` ──────────────────────────────────────────────
 *
 * Quand une messagerie convertit un HTML en texte, `<a href="X">Y</a>`
 * devient `Y<X>`. D'où le `naywastudio.com<https://naywastudio.com/>` qu'on
 * lit dans les signatures. Ce n'est pas une anomalie de notre côté : c'est la
 * version texte de leur message. On le reconnaît et on n'affiche que le
 * libellé, pointant vers l'URL.
 */

export type TextSegment =
  | { kind: "text"; value: string }
  | { kind: "link"; label: string; href: string }

/** Reconnaît `libellé<url>` (conversion HTML→texte) puis les URL nues. */
const PATTERN = /([^\s<>]+)<((?:https?:\/\/|mailto:)[^\s<>]+)>|((?:https?:\/\/|www\.)[^\s<>()[\]]+)/gi

/** La ponctuation finale n'appartient pas au lien : « voir https://x.fr. » */
function trimTrailing(url: string): { url: string; rest: string } {
  const m = url.match(/[.,;:!?)\]]+$/)
  return m ? { url: url.slice(0, -m[0].length), rest: m[0] } : { url, rest: "" }
}

/**
 * Découpe un texte en segments, dont les liens.
 *
 * Renvoie des données, pas du balisage : c'est le composant qui décide du
 * rendu. Une fonction qui renverrait du HTML rouvrirait exactement la porte
 * qu'on vient de fermer.
 */
export function linkify(text: string): TextSegment[] {
  const out: TextSegment[] = []
  let last = 0

  for (const m of text.matchAll(PATTERN)) {
    const start = m.index ?? 0
    if (start > last) out.push({ kind: "text", value: text.slice(last, start) })

    if (m[2]) {
      // Forme `libellé<url>` : on garde le libellé, on pointe vers l'URL.
      out.push({ kind: "link", label: m[1], href: m[2] })
    } else {
      const { url, rest } = trimTrailing(m[3])
      if (url) {
        // `www.x.fr` sans schéma deviendrait un lien RELATIF, donc un lien
        // vers une page de Naywa qui n'existe pas.
        out.push({ kind: "link", label: url, href: /^www\./i.test(url) ? `https://${url}` : url })
      }
      if (rest) out.push({ kind: "text", value: rest })
    }
    last = start + m[0].length
  }

  if (last < text.length) out.push({ kind: "text", value: text.slice(last) })
  return out
}

/**
 * Ce lien est-il sûr à poser dans un `href` ?
 *
 * Seuls `http`, `https` et `mailto`. Sans ce filtre, un `javascript:` glissé
 * dans un message de candidat s'exécuterait au clic, dans la session du
 * sourceur. Le motif de découpage ne les produit pas aujourd'hui — mais un
 * filtre qui dépend de la forme d'une expression régulière ailleurs dans le
 * fichier n'en est pas un.
 */
export function isSafeHref(href: string): boolean {
  return /^(https?:|mailto:)/i.test(href.trim())
}
