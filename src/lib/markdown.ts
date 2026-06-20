/**
 * Mini parser markdown utilisé dans /nouveautes et /admin/maj.
 *
 * Volontairement minimal — gras, italique, listes, paragraphes, liens,
 * code inline. Pas d'images, pas de tableaux, pas de blocs HTML
 * arbitraires. Suffisant pour publier un changelog produit.
 *
 * On évite d'embarquer une lib type marked / micromark (~30 KB) pour
 * un usage aussi simple ; et on a un contrôle total sur le rendu HTML
 * (anti-XSS : on échappe d'abord, puis on remplace).
 */

export function renderMarkdown(src: string): string {
  // 1. Escape HTML d'abord — protège contre toute injection.
  let s = src
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")

  // 2. Liens : [label](url) — on n'autorise que http(s) et mailto.
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,
    (_m, label: string, url: string) =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#7C63C8;text-decoration:underline">${label}</a>`,
  )

  // 3. Code inline `code`.
  s = s.replace(/`([^`]+)`/g,
    (_m, code: string) =>
      `<code style="background:#F3F4F6;padding:1px 5px;border-radius:4px;font-size:0.92em;font-family:ui-monospace,monospace">${code}</code>`,
  )

  // 4. Gras **xxx** / __xxx__.
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  s = s.replace(/__([^_]+)__/g, "<strong>$1</strong>")

  // 5. Italique *xxx* / _xxx_ (après le gras pour éviter les conflits).
  s = s.replace(/(^|[^*])\*([^*\n]+)\*([^*]|$)/g, "$1<em>$2</em>$3")
  s = s.replace(/(^|[^_])_([^_\n]+)_([^_]|$)/g, "$1<em>$2</em>$3")

  // 6. Listes — lignes commençant par "- " regroupées en <ul>.
  const lines = s.split(/\r?\n/)
  const out: string[] = []
  let inList = false
  for (const raw of lines) {
    const line = raw.trimEnd()
    const isItem = /^- (.*)$/.test(line)
    if (isItem) {
      if (!inList) { out.push("<ul style=\"margin:8px 0;padding-left:20px\">"); inList = true }
      out.push(`<li style="margin:4px 0">${line.replace(/^- /, "")}</li>`)
    } else {
      if (inList) { out.push("</ul>"); inList = false }
      if (line === "") out.push("")
      else out.push(line)
    }
  }
  if (inList) out.push("</ul>")
  s = out.join("\n")

  // 7. Paragraphes — split sur \n\n, wrap en <p>.
  s = s
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => {
      // Déjà un bloc liste : on ne re-wrap pas.
      if (p.startsWith("<ul")) return p
      // Saute les sauts de ligne simples dans un paragraphe.
      return `<p style="margin:8px 0;line-height:1.6">${p.replace(/\n/g, " ")}</p>`
    })
    .join("")

  return s
}
