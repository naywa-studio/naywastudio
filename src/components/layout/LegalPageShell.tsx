import Link from "next/link"
import { Logo } from "@/components/ui/Logo"
import { ShaderBackground } from "@/components/ui/ShaderBackground"

/**
 * Shared chrome for the static legal pages :
 *   - /mentions-legales
 *   - /politique-confidentialite
 *   - /cgu
 *
 * Same header / hero / footer everywhere — only the SECTIONS array
 * differs between pages. Lines starting and ending with ** render as a
 * bold standout (the same convention as the existing mentions-legales).
 */

export interface LegalSection {
  title: string
  content: string[]
}

interface Props {
  badge?: string
  title: string
  lastUpdated: string
  intro?: string
  sections: LegalSection[]
}

export function LegalPageShell({ badge = "Légal", title, lastUpdated, intro, sections }: Props) {
  return (
    <div style={{ background: "#FAFAFA", minHeight: "100vh", position: "relative" }}>
      <ShaderBackground />
      {/* Header */}
      <header
        style={{
          position: "sticky", top: 0, zIndex: 40,
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid #F0ECF8",
          padding: "0 24px", height: 64,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}
      >
        <Link href="/" style={{ textDecoration: "none" }}>
          <Logo size="md" />
        </Link>
        <Link href="/" style={{
          fontSize: 13, color: "#6B7280", textDecoration: "none",
          fontFamily: "var(--font-inter), sans-serif",
        }}>
          ← Retour à l&apos;accueil
        </Link>
      </header>

      {/* Content */}
      <main style={{ maxWidth: 720, margin: "0 auto", padding: "64px 24px 80px" }}>
        {/* Hero */}
        <div style={{ marginBottom: 56 }}>
          <span style={{
            display: "inline-block",
            fontSize: 11, fontWeight: 700,
            letterSpacing: 1.5, textTransform: "uppercase",
            color: "#7C63C8", background: "#F0ECF8",
            padding: "5px 14px", borderRadius: 100, marginBottom: 20,
            fontFamily: "var(--font-inter), sans-serif",
          }}>
            {badge}
          </span>
          <h1 style={{
            fontSize: "clamp(26px, 4vw, 38px)",
            fontWeight: 800, color: "#111827",
            margin: "0 0 12px", letterSpacing: -0.3,
            fontFamily: "var(--font-space-grotesk), sans-serif",
          }}>
            {title}
          </h1>
          <p style={{
            fontSize: 14, color: "#9CA3AF", margin: 0,
            fontFamily: "var(--font-inter), sans-serif",
          }}>
            Dernière mise à jour : {lastUpdated}
          </p>
          {intro && (
            <p style={{
              marginTop: 22, fontSize: 14.5, color: "#4B5563", lineHeight: 1.7,
              fontFamily: "var(--font-inter), sans-serif",
            }}>
              {intro}
            </p>
          )}
        </div>

        {/* Sections */}
        <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
          {sections.map((section) => (
            <section key={section.title}>
              <h2 style={{
                fontSize: 17, fontWeight: 700, color: "#111827",
                margin: "0 0 16px",
                fontFamily: "var(--font-space-grotesk), sans-serif",
                paddingBottom: 12, borderBottom: "1px solid #F0ECF8",
              }}>
                {section.title}
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {section.content.map((line, i) => {
                  const isBold = line.startsWith("**") && line.endsWith("**")
                  const text = isBold ? line.slice(2, -2) : line
                  return (
                    <p key={i} style={{
                      margin: 0, fontSize: 14, lineHeight: 1.7,
                      color: isBold ? "#111827" : "#4B5563",
                      fontWeight: isBold ? 600 : 400,
                      fontFamily: "var(--font-inter), sans-serif",
                    }}>
                      {text}
                    </p>
                  )
                })}
              </div>
            </section>
          ))}
        </div>

        {/* Contact */}
        <div style={{
          marginTop: 56, background: "#F8F6FF",
          borderRadius: 16, padding: "28px 24px",
          border: "1px solid #E2DAF6",
        }}>
          <p style={{
            margin: "0 0 6px", fontSize: 15, fontWeight: 600, color: "#111827",
            fontFamily: "var(--font-space-grotesk), sans-serif",
          }}>
            Une question ?
          </p>
          <p style={{
            margin: "0 0 16px", fontSize: 14, color: "#6B7280",
            fontFamily: "var(--font-inter), sans-serif",
          }}>
            Écrivez-nous, nous répondons sous 48 h ouvrées.
          </p>
          <a href="mailto:contact@naywastudio.com" style={{
            fontSize: 14, fontWeight: 600, color: "#7C63C8", textDecoration: "none",
            fontFamily: "var(--font-inter), sans-serif",
          }}>
            contact@naywastudio.com →
          </a>
        </div>
      </main>

      {/* Footer */}
      <footer style={{
        padding: 24, borderTop: "1px solid #F0ECF8",
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: 16, flexWrap: "wrap",
      }}>
        <Logo size="sm" />
        <span style={{ fontSize: 12, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>
          © 2026 Naywa Studio
        </span>
        <FooterLink href="/mentions-legales">Mentions légales</FooterLink>
        <FooterLink href="/politique-confidentialite">Confidentialité</FooterLink>
        <FooterLink href="/cgu">CGU</FooterLink>
        <a href="mailto:contact@naywastudio.com" style={footerLinkStyle}>
          contact@naywastudio.com
        </a>
      </footer>
    </div>
  )
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} style={footerLinkStyle}>{children}</Link>
}

const footerLinkStyle: React.CSSProperties = {
  fontSize: 12, color: "#9CA3AF", textDecoration: "none",
  fontFamily: "var(--font-inter), sans-serif",
}
