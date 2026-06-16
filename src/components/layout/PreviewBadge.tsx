/**
 * Badge "PREVIEW" affiché en haut à droite de toutes les pages quand
 * l'app tourne sur un déploiement preview Vercel (= branche autre que
 * main). Sert à Elyas pour distinguer d'un coup d'œil le déploiement
 * de validation de la prod naywastudio.com.
 *
 * Détection : `process.env.VERCEL_ENV === "preview"`. En prod ce
 * composant retourne `null` et n'émet aucun markup.
 *
 * Server Component — pas de bundle JS côté client.
 */

export function PreviewBadge() {
  if (process.env.VERCEL_ENV !== "preview") {
    return null
  }

  const branch = process.env.VERCEL_GIT_COMMIT_REF ?? "preview"

  return (
    <div
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        zIndex: 9999,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px 6px 8px",
        borderRadius: 999,
        background: "#7C63C8",
        color: "#FFFFFF",
        fontFamily: "var(--font-inter), sans-serif",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        boxShadow: "0 4px 12px rgba(124, 99, 200, 0.35)",
        pointerEvents: "none",
        userSelect: "none",
      }}
      aria-label={`Déploiement preview de la branche ${branch}`}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: "#FBBF24",
          boxShadow: "0 0 0 2px rgba(251, 191, 36, 0.25)",
        }}
      />
      Preview
      <span
        style={{
          fontFamily: "var(--font-space-grotesk), sans-serif",
          fontWeight: 500,
          opacity: 0.8,
          letterSpacing: "0.02em",
          textTransform: "none",
          maxWidth: 160,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {branch}
      </span>
    </div>
  )
}
