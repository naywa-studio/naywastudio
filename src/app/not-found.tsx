import Link from "next/link"

/**
 * Page 404 brandée — sans elle, un lien mort tombait sur la page par défaut
 * de Next.js (anglaise, hors charte). Sobre : wordmark, message, deux CTA.
 */
export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: "#F8F6FF", padding: 24, textAlign: "center",
        fontFamily: "var(--font-inter), ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-space-grotesk), ui-sans-serif, sans-serif",
          fontSize: 22, fontWeight: 700, color: "#111827",
          letterSpacing: "-0.02em", marginBottom: 26,
        }}
      >
        Naywa<span style={{ color: "#7C63C8" }}> Studio</span>
      </span>

      <p
        style={{
          margin: 0, fontSize: 64, fontWeight: 800, lineHeight: 1,
          color: "#7C63C8", letterSpacing: "-0.03em",
          fontFamily: "var(--font-space-grotesk), ui-sans-serif, sans-serif",
        }}
      >
        404
      </p>
      <h1 style={{ margin: "14px 0 8px", fontSize: 20, fontWeight: 800, color: "#111827" }}>
        Cette page n&apos;existe pas
      </h1>
      <p style={{ margin: "0 0 26px", fontSize: 14, color: "#6B7280", maxWidth: 380, lineHeight: 1.6 }}>
        Le lien est peut-être expiré ou l&apos;adresse a changé.
      </p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
        <Link
          href="/"
          style={{
            padding: "11px 20px", borderRadius: 10,
            background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
            color: "white", fontSize: 13.5, fontWeight: 700,
            textDecoration: "none",
            boxShadow: "0 6px 20px -8px rgba(124,99,200,0.55)",
          }}
        >
          Retour à l&apos;accueil
        </Link>
        <Link
          href="/workspace"
          style={{
            padding: "11px 20px", borderRadius: 10,
            border: "1px solid rgba(124,99,200,0.30)", background: "white",
            color: "#7C63C8", fontSize: 13.5, fontWeight: 700,
            textDecoration: "none",
          }}
        >
          Mon workspace
        </Link>
      </div>
    </div>
  )
}
