"use client"

import { NoraAvatar } from "./NoraAvatar"

/**
 * Standard loading placeholder for workspace pages and panels.
 *
 * Sober: a tiny Nora avatar in "thinking" state with a slow float +
 * subtle ellipsis under the label. Replaces the previous "Chargement…"
 * plain-text loader that was used inconsistently across the workspace.
 *
 *   - `inline` for in-card placeholders (no min height)
 *   - default (block) centers in a tall container, used at page level
 */
export default function NoraLoader({
  label = "Chargement",
  inline = false,
  size = 36,
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
        ? { display: "inline-flex", alignItems: "center", gap: 10, color: "#9CA3AF", fontSize: 13 }
        : { minHeight: 220, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 32 }
      }
    >
      <div className="nora-loader-bob" style={{ display: "inline-flex", alignItems: "center" }}>
        <NoraAvatar state="thinking" size={size} />
      </div>
      <span style={{
        fontSize: inline ? 13 : 13.5,
        color: "#6B7280",
        fontWeight: 500,
        letterSpacing: "0.02em",
      }} className="nora-loader-label">
        {label}<span className="nora-loader-dots" />
      </span>

      <style>{`
        @keyframes noraBob {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-4px); }
        }
        .nora-loader-bob {
          animation: noraBob 1.6s ease-in-out infinite;
        }

        @keyframes noraDots {
          0%   { content: ""; }
          25%  { content: "."; }
          50%  { content: ".."; }
          75%  { content: "..."; }
          100% { content: ""; }
        }
        .nora-loader-dots::after {
          display: inline-block;
          width: 1.5em;
          text-align: left;
          content: "";
          animation: noraDots 1.4s steps(4, end) infinite;
        }
      `}</style>
    </div>
  )
}
