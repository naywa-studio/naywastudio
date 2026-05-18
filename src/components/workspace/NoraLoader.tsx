"use client"

/**
 * Simple loading placeholder for workspace pages and panels.
 *
 * Small spinning ring in Naywa purple + label. Replaces the previous
 * "Chargement…" plain-text loader. Sober and consistent across the app.
 *
 *   - `inline` for in-card placeholders (no min height)
 *   - default (block) centers in a tall container, used at page level
 */
export default function NoraLoader({
  label = "Chargement",
  inline = false,
  size = 22,
}: {
  label?: string
  inline?: boolean
  size?: number
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={inline
        ? { display: "inline-flex", alignItems: "center", gap: 10, color: "#6B7280", fontSize: 13 }
        : { minHeight: 220, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: 32 }
      }
    >
      <span style={{
        display: "inline-block",
        width: size, height: size,
        borderRadius: "50%",
        border: `${Math.max(2, Math.round(size / 11))}px solid #E2DAF6`,
        borderTopColor: "#7C63C8",
        animation: "noraSpin 0.8s linear infinite",
      }} />
      <span style={{ fontSize: inline ? 13 : 13.5, color: "#6B7280", fontWeight: 500 }}>
        {label}…
      </span>

      <style>{`
        @keyframes noraSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
