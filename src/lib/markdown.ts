/**
 * Mini parser markdown utilisé dans /nouveautes et /admin/maj.
 *
 * Volontairement minimal mais enrichi pour le changelog produit :
 *   - inline : gras **x**, italique *x*, code `x`, liens [t](url)
 *   - blocs : paragraphes, listes "- ", titres "## "
 *   - callouts : :::tip / :::info / :::warning / :::success ... :::
 *   - CTA inline : :::cta /path|Label::: (bouton violet vers page interne)
 *   - pastilles inline : [NOUVEAU], [FIX], [AMÉLIORATION], [ATTENTION]
 *
 * Pas d'images, pas de tableaux, pas de blocs HTML arbitraires.
 * Anti-XSS : on échappe tout d'abord, puis on remplace.
 * Pour les CTA, on n'autorise que les paths internes ("/...").
 */

// ─── Constantes visuelles ──────────────────────────────────────────────

const CALLOUT_META: Record<
  "tip" | "info" | "warning" | "success",
  { color: string; bg: string; border: string; label: string; icon: string }
> = {
  tip: {
    color: "#7C63C8",
    bg: "rgba(124,99,200,0.07)",
    border: "rgba(124,99,200,0.28)",
    label: "Astuce",
    icon:
      "<svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M9 18h6\"/><path d=\"M10 22h4\"/><path d=\"M12 2a7 7 0 0 0-4 12.7c.5.4.8.9.9 1.4l.2.9h5.8l.2-.9c.1-.5.4-1 .9-1.4A7 7 0 0 0 12 2Z\"/></svg>",
  },
  info: {
    color: "#0369A1",
    bg: "rgba(3,105,161,0.07)",
    border: "rgba(3,105,161,0.28)",
    label: "Info",
    icon:
      "<svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 16v-4\"/><path d=\"M12 8h.01\"/></svg>",
  },
  warning: {
    color: "#B45309",
    bg: "rgba(245,158,11,0.10)",
    border: "rgba(245,158,11,0.32)",
    label: "Attention",
    icon:
      "<svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z\"/><path d=\"M12 9v4\"/><path d=\"M12 17h.01\"/></svg>",
  },
  success: {
    color: "#15803D",
    bg: "rgba(34,197,94,0.09)",
    border: "rgba(34,197,94,0.32)",
    label: "Validé",
    icon:
      "<svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M20 6 9 17l-5-5\"/></svg>",
  },
}

const PASTILLE_META: Record<string, { color: string; bg: string; label: string }> = {
  NOUVEAU:       { color: "#15803D", bg: "rgba(34,197,94,0.14)",  label: "Nouveau" },
  FIX:           { color: "#0369A1", bg: "rgba(3,105,161,0.14)",  label: "Fix" },
  AMELIORATION:  { color: "#7C63C8", bg: "rgba(124,99,200,0.14)", label: "Amélioration" },
  AMÉLIORATION:  { color: "#7C63C8", bg: "rgba(124,99,200,0.14)", label: "Amélioration" },
  ATTENTION:     { color: "#B45309", bg: "rgba(245,158,11,0.14)", label: "Attention" },
  BETA:          { color: "#6B7280", bg: "rgba(107,114,128,0.14)", label: "Bêta" },
}

// SVG sparkle utilisée comme bullet des titres ## (couleur primaire).
const SPARKLE_SVG =
  "<svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#7C63C8\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z\"/></svg>"

// ─── Helpers ───────────────────────────────────────────────────────────

function escapeHtml(src: string): string {
  return src
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

/**
 * Inline-only : gras, italique, code, liens, pastilles, CTA.
 * S'applique sur du texte déjà escape-HTML.
 */
function renderInline(s: string): string {
  // CTA :::cta /path|Label::: — bouton violet vers une route interne.
  // On n'autorise que les paths qui commencent par "/" et qui ne sont
  // pas des protocol-relative ("//xxx") — anti open-redirect.
  s = s.replace(/:::cta\s+([^\s|]+)\s*\|\s*([^:]+):::/g, (_m, rawPath: string, label: string) => {
    const path = rawPath.trim()
    const safeLabel = label.trim()
    if (!path.startsWith("/") || path.startsWith("//")) return safeLabel
    return (
      `<a href="${path}" style="` +
      "display:inline-flex;align-items:center;gap:6px;" +
      "padding:7px 13px;border-radius:8px;" +
      "background:#7C63C8;color:white;text-decoration:none;" +
      "font-weight:600;font-size:13px;letter-spacing:-0.01em;" +
      "box-shadow:0 1px 2px rgba(124,99,200,0.30);" +
      "margin:2px 0;" +
      `">${safeLabel}` +
      "<svg width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M5 12h14\"/><path d=\"m12 5 7 7-7 7\"/></svg>" +
      "</a>"
    )
  })

  // Pastilles inline [NOUVEAU], [FIX], [AMÉLIORATION], etc.
  // On matche en majuscules pour éviter les conflits avec des liens
  // markdown [label](url) qui sont, eux, déjà traités… ah non, ils ne
  // le sont pas encore à ce stade — donc on exige l'absence de "(" juste
  // après le ] pour ne pas casser un lien.
  s = s.replace(/\[([A-ZÉÊÀÈ]{3,15})\](?!\()/g, (m, key: string) => {
    const meta = PASTILLE_META[key]
    if (!meta) return m
    return (
      `<span style="` +
      "display:inline-block;padding:1px 7px;border-radius:999px;" +
      `background:${meta.bg};color:${meta.color};` +
      "font-size:10px;font-weight:700;letter-spacing:0.06em;" +
      "text-transform:uppercase;vertical-align:1px;margin:0 2px;" +
      `">${meta.label}</span>`
    )
  })

  // Liens [label](url) — http(s) et mailto seulement.
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,
    (_m, label: string, url: string) =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#7C63C8;text-decoration:underline">${label}</a>`,
  )

  // Code inline `code`.
  s = s.replace(/`([^`]+)`/g,
    (_m, code: string) =>
      `<code style="background:#F3F4F6;padding:1px 5px;border-radius:4px;font-size:0.92em;font-family:ui-monospace,monospace">${code}</code>`,
  )

  // Gras **xxx** / __xxx__.
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  s = s.replace(/__([^_]+)__/g, "<strong>$1</strong>")

  // Italique *xxx* / _xxx_ (après le gras pour éviter les conflits).
  s = s.replace(/(^|[^*])\*([^*\n]+)\*([^*]|$)/g, "$1<em>$2</em>$3")
  s = s.replace(/(^|[^_])_([^_\n]+)_([^_]|$)/g, "$1<em>$2</em>$3")

  return s
}

/**
 * Bloc-level : applique inline + groupage paragraphes/listes/titres.
 * Pas de support callout ici (les callouts sont extraits avant et
 * leur contenu interne est passé dans cette fonction récursivement).
 */
function renderBlocks(src: string): string {
  let s = renderInline(src)

  const lines = s.split(/\r?\n/)
  const out: string[] = []
  let inList = false

  for (const raw of lines) {
    const line = raw.trimEnd()

    // ## Titre — barre violette + sparkle.
    const h2 = /^##\s+(.+)$/.exec(line)
    if (h2) {
      if (inList) { out.push("</ul>"); inList = false }
      out.push(
        "<h3 style=\"" +
          "display:flex;align-items:center;gap:9px;" +
          "margin:20px 0 10px;padding-left:11px;" +
          "border-left:3px solid #7C63C8;" +
          "font-size:15.5px;font-weight:700;color:#111827;" +
          "letter-spacing:-0.01em;line-height:1.3;" +
        "\">" +
        SPARKLE_SVG +
        `<span>${h2[1]}</span>` +
        "</h3>",
      )
      continue
    }

    // - item — liste.
    const li = /^- (.*)$/.exec(line)
    if (li) {
      if (!inList) { out.push("<ul style=\"margin:8px 0;padding-left:20px\">"); inList = true }
      out.push(`<li style="margin:4px 0">${li[1]}</li>`)
      continue
    }

    if (inList) { out.push("</ul>"); inList = false }
    out.push(line)
  }
  if (inList) out.push("</ul>")

  s = out.join("\n")

  // Paragraphes — split sur \n\n, wrap en <p> sauf les blocs HTML.
  return s
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => {
      if (p.startsWith("<ul") || p.startsWith("<h3")) return p
      return `<p style="margin:8px 0;line-height:1.6">${p.replace(/\n/g, " ")}</p>`
    })
    .join("")
}

// ─── Point d'entrée ────────────────────────────────────────────────────

export function renderMarkdown(src: string): string {
  // 1. Escape HTML d'abord.
  const escaped = escapeHtml(src)

  // 2. Extraire les callouts (:::tip / :::info / :::warning / :::success).
  //    Leur contenu interne est rendu via renderBlocks récursivement,
  //    puis stocké et remplacé par un placeholder pour ne pas être
  //    re-wrappé dans un paragraphe.
  const callouts: string[] = []
  const PLACEHOLDER_PREFIX = " CALLOUT"
  const PLACEHOLDER_SUFFIX = " "

  const stagedSrc = escaped.replace(
    /:::(tip|info|warning|success)[ \t]*\n([\s\S]*?)\n:::/g,
    (_m, type: keyof typeof CALLOUT_META, body: string) => {
      const meta = CALLOUT_META[type]
      const inner = renderBlocks(body.trim())
      const html =
        "<div style=\"" +
          "display:flex;gap:11px;align-items:flex-start;" +
          "margin:14px 0;padding:13px 15px;border-radius:12px;" +
          `background:${meta.bg};border:1px solid ${meta.border};` +
        "\">" +
          `<div style="flex-shrink:0;color:${meta.color};margin-top:2px">${meta.icon}</div>` +
          "<div style=\"flex:1;min-width:0\">" +
            "<div style=\"" +
              `font-size:10.5px;font-weight:700;color:${meta.color};` +
              "letter-spacing:0.07em;text-transform:uppercase;margin-bottom:3px;" +
            `">${meta.label}</div>` +
            `<div style="font-size:13.5px;color:#1F2937;line-height:1.6">${inner}</div>` +
          "</div>" +
        "</div>"
      callouts.push(html)
      return `${PLACEHOLDER_PREFIX}${callouts.length - 1}${PLACEHOLDER_SUFFIX}`
    },
  )

  // 3. Rendre le reste (paragraphes, listes, titres, inline).
  let rendered = renderBlocks(stagedSrc)

  // 4. Ré-injecter les callouts. Si un callout s'est retrouvé
  //    enrobé d'un <p>…</p> par le paragraph-wrap, on retire ce
  //    wrap (le callout est déjà un bloc).
  rendered = rendered.replace(
    new RegExp(`(?:<p[^>]*>\\s*)?${PLACEHOLDER_PREFIX}(\\d+)${PLACEHOLDER_SUFFIX}(?:\\s*</p>)?`, "g"),
    (_m, idx: string) => callouts[Number(idx)] ?? "",
  )

  return rendered
}
