"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Navbar } from "@/components/layout/Navbar"
import { Footer } from "@/components/layout/Footer"

type ExtensionStatus = "checking" | "installed" | "missing"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]
void EASE

export default function InstallPage() {
  const [status, setStatus] = useState<ExtensionStatus>("checking")

  useEffect(() => {
    let settled = false
    const handler = (event: MessageEvent) => {
      if (event.source !== window) return
      const d = event.data as { source?: string; type?: string }
      if (d?.source === "nawa-extension" && (d.type === "READY" || d.type === "PONG")) {
        settled = true
        window.removeEventListener("message", handler)
        setStatus("installed")
      }
    }
    window.addEventListener("message", handler)
    // Send a PING in case the extension is already loaded but missed our READY race
    window.postMessage({ source: "nawa-page", type: "PING_EXTENSION" }, window.location.origin)
    const t = setTimeout(() => {
      if (!settled) {
        window.removeEventListener("message", handler)
        setStatus("missing")
      }
    }, 1500)
    return () => {
      window.removeEventListener("message", handler)
      clearTimeout(t)
    }
  }, [])

  return (
    <div style={{ background: "#FAFAFA", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Navbar />

      <main style={{ flex: 1, padding: "120px 24px 60px", maxWidth: 720, width: "100%", margin: "0 auto" }}>
        {/* Beta pill */}
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          background: "rgba(124,99,200,0.10)", border: "1px solid rgba(124,99,200,0.22)",
          borderRadius: 999, padding: "5px 12px 5px 8px",
          marginBottom: 20,
          fontFamily: "var(--font-inter), sans-serif",
          fontSize: 12, fontWeight: 600, color: "#7C63C8",
        }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#7C63C8", display: "inline-block" }} />
          Extension Chrome — phase beta
        </span>

        <h1 style={{
          fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, color: "#111827",
          letterSpacing: "-0.025em", lineHeight: 1.1,
          margin: "0 0 16px",
          fontFamily: "var(--font-inter), sans-serif",
        }}>
          Installer l&apos;extension Naywa Studio
        </h1>
        <p style={{
          fontSize: 16, color: "#4B5563", lineHeight: 1.6,
          margin: "0 0 36px", maxWidth: 540,
          fontFamily: "var(--font-inter), sans-serif",
        }}>
          L&apos;extension Chrome rend les recherches plus rapides et économise tes
          quotas API. Léo fonctionne sans, mais c&apos;est mieux avec.
        </p>

        {/* Status badge */}
        <StatusBadge status={status} />

        {/* Steps */}
        <div style={{
          background: "white", borderRadius: 16,
          border: "1px solid #F0ECF8",
          padding: "24px 28px",
          marginTop: 24,
          fontFamily: "var(--font-inter), sans-serif",
        }}>
          <p style={{
            margin: "0 0 18px", fontSize: 11, fontWeight: 700,
            color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.07em",
          }}>
            Procédure d&apos;installation
          </p>

          <Step
            n={1}
            title="Télécharge l'extension"
            body={
              <>
                <p style={{ margin: "0 0 12px", fontSize: 14, color: "#374151", lineHeight: 1.6 }}>
                  Récupère l&apos;archive ZIP. Garde-la dans un dossier que tu ne supprimeras pas
                  (par exemple <code style={codeStyle}>Documents/Naywa/</code>).
                </p>
                <a
                  href="/naywa-extension.zip"
                  download
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 7,
                    padding: "10px 20px", borderRadius: 10,
                    background: "#7C63C8", color: "white",
                    fontSize: 13, fontWeight: 700, textDecoration: "none",
                    boxShadow: "0 4px 16px rgba(124,99,200,0.28)",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                    <path d="M10 3v10m0 0l-4-4m4 4l4-4M4 17h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Télécharger naywa-extension.zip
                </a>
              </>
            }
          />

          <Step
            n={2}
            title="Décompresse l'archive"
            body={
              <p style={{ margin: 0, fontSize: 14, color: "#374151", lineHeight: 1.6 }}>
                Clic droit sur le ZIP → <strong>Extraire</strong>. Tu obtiens un dossier
                <code style={codeStyle}>nawa-extension/</code> contenant un fichier <code style={codeStyle}>manifest.json</code>.
              </p>
            }
          />

          <Step
            n={3}
            title="Ouvre la page extensions de Chrome"
            body={
              <>
                <p style={{ margin: "0 0 8px", fontSize: 14, color: "#374151", lineHeight: 1.6 }}>
                  Dans Chrome, copie cette URL dans la barre d&apos;adresse :
                </p>
                <code style={{ ...codeStyle, display: "block", padding: "9px 12px", fontSize: 13 }}>
                  chrome://extensions
                </code>
              </>
            }
          />

          <Step
            n={4}
            title="Active le mode développeur"
            body={
              <p style={{ margin: 0, fontSize: 14, color: "#374151", lineHeight: 1.6 }}>
                En haut à droite de la page, active l&apos;interrupteur <strong>« Mode développeur »</strong>.
                Trois boutons supplémentaires apparaissent en haut à gauche.
              </p>
            }
          />

          <Step
            n={5}
            title="Charge le dossier décompressé"
            body={
              <p style={{ margin: 0, fontSize: 14, color: "#374151", lineHeight: 1.6 }}>
                Clique sur <strong>« Charger l&apos;extension non empaquetée »</strong>, puis
                sélectionne le dossier <code style={codeStyle}>nawa-extension/</code> que tu as obtenu à l&apos;étape 2.
              </p>
            }
            last
          />

          <div style={{
            marginTop: 18, padding: "12px 14px",
            background: "rgba(124,99,200,0.05)",
            border: "1px solid rgba(124,99,200,0.18)",
            borderRadius: 10,
          }}>
            <p style={{ margin: 0, fontSize: 13, color: "#374151", lineHeight: 1.6 }}>
              <strong style={{ color: "#7C63C8" }}>✓ Et voilà.</strong> L&apos;icône Naywa Studio
              apparaît dans la barre d&apos;outils Chrome. Recharge cette page pour vérifier
              que l&apos;extension est bien détectée.
            </p>
          </div>
        </div>

        {/* Privacy note */}
        <p style={{
          marginTop: 28, fontSize: 13, color: "#6B7280", lineHeight: 1.6,
          fontFamily: "var(--font-inter), sans-serif",
        }}>
          <strong>Vie privée :</strong> l&apos;extension n&apos;envoie rien à Naywa Studio sans ton accord.
          Elle utilise ton navigateur pour effectuer les recherches LinkedIn / Malt à ta place,
          puis pousse les résultats dans ton workspace. Code source disponible sur demande.
        </p>

        {/* Skip / shortcut */}
        <div style={{
          marginTop: 36, paddingTop: 24,
          borderTop: "1px solid #F0ECF8",
          display: "flex", flexDirection: "column", gap: 8,
          fontFamily: "var(--font-inter), sans-serif",
        }}>
          <p style={{ margin: 0, fontSize: 13, color: "#9CA3AF" }}>
            Pas envie d&apos;installer l&apos;extension maintenant ?
          </p>
          <Link href="/workspace" style={{
            color: "#7C63C8", fontSize: 14, fontWeight: 600,
            textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5,
          }}>
            Aller au workspace sans extension →
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  )
}

const codeStyle: React.CSSProperties = {
  background: "#F0ECF8",
  color: "#7C63C8",
  padding: "1px 6px",
  borderRadius: 5,
  fontFamily: "ui-monospace, SFMono-Regular, monospace",
  fontSize: 13,
}

function Step({ n, title, body, last = false }: { n: number; title: string; body: React.ReactNode; last?: boolean }) {
  return (
    <div style={{
      display: "flex", gap: 14,
      paddingBottom: last ? 0 : 18,
      borderBottom: last ? "none" : "1px solid #F0ECF8",
      marginBottom: last ? 0 : 18,
    }}>
      <div style={{
        flexShrink: 0,
        width: 28, height: 28, borderRadius: "50%",
        background: "#F0ECF8", color: "#7C63C8",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 13, fontWeight: 700,
        fontFamily: "var(--font-inter), sans-serif",
      }}>{n}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          margin: "4px 0 8px", fontSize: 15, fontWeight: 700, color: "#111827",
          fontFamily: "var(--font-inter), sans-serif",
        }}>{title}</p>
        {body}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: ExtensionStatus }) {
  if (status === "checking") {
    return (
      <div style={badgeStyle("#9CA3AF", "#F3F4F6")}>
        <Spinner /> Détection de l&apos;extension…
      </div>
    )
  }
  if (status === "installed") {
    return (
      <div style={badgeStyle("#16a34a", "rgba(22,163,74,0.08)", "rgba(22,163,74,0.22)")}>
        <span style={{ fontSize: 16 }}>✓</span> Extension détectée — tu es prêt à lancer tes recherches
        <Link href="/workspace" style={{ marginLeft: "auto", color: "#16a34a", fontSize: 13, fontWeight: 700, textDecoration: "underline" }}>
          Aller au workspace
        </Link>
      </div>
    )
  }
  return (
    <div style={badgeStyle("#7C63C8", "rgba(124,99,200,0.08)", "rgba(124,99,200,0.22)")}>
      <span style={{ fontSize: 16 }}>⬇</span>
      Extension non détectée — suis les étapes ci-dessous
    </div>
  )
}

function badgeStyle(color: string, bg: string, border: string = "transparent"): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: 8,
    padding: "12px 16px",
    borderRadius: 12,
    background: bg,
    border: `1px solid ${border}`,
    color, fontSize: 14, fontWeight: 600,
    fontFamily: "var(--font-inter), sans-serif",
  }
}

function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" style={{ animation: "spin 0.8s linear infinite" }}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" fill="none" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </svg>
  )
}
