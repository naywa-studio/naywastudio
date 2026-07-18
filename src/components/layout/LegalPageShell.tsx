import Link from "next/link"
import { Logo } from "@/components/ui/Logo"
import { BrandBands } from "@/components/ui/BrandBands"
import { Eyebrow } from "@/components/brand/Eyebrow"
import { brand, type as t } from "@/lib/brand"

/**
 * Chrome partagé des pages légales statiques :
 *   - /mentions-legales
 *   - /politique-confidentialite
 *   - /cgu
 *
 * Même header / hero / footer partout — seul le tableau SECTIONS diffère
 * d'une page à l'autre. Une ligne encadrée par ** ressort en gras.
 *
 * Charte v2.0 : sur-titre mono §, titres Fraunces, corps Inter (lecture
 * dense), surfaces craie + bordures lin, fond papier via BrandBands.
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
    <div style={{ background: "transparent", minHeight: "100vh", position: "relative" }}>
      <BrandBands />
      <div style={{ position: "relative", zIndex: 2 }}>
      {/* Header */}
      <header
        style={{
          position: "sticky", top: 0, zIndex: 40,
          background: "rgba(253,252,249,0.92)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: `1px solid ${brand.border}`,
          padding: "0 24px", height: 64,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}
      >
        <Link href="/" style={{ textDecoration: "none" }}>
          <Logo size="md" />
        </Link>
        <Link href="/" style={{ ...t.caption, color: brand.textMuted, textDecoration: "none" }}>
          ← Retour à l&apos;accueil
        </Link>
      </header>

      {/* Content */}
      <main style={{ maxWidth: 1120, margin: "0 auto", padding: "64px 24px 80px" }}>
        {/* Hero — largeur de lecture confortable. */}
        <div style={{ maxWidth: 720, margin: "0 auto 56px" }}>
          <Eyebrow>{badge}</Eyebrow>
          <h1 style={{ ...t.h1, fontSize: "clamp(26px, 4vw, 40px)", margin: "16px 0 12px" }}>
            {title}
          </h1>
          <p style={{ ...t.caption, margin: 0 }}>
            Dernière mise à jour : {lastUpdated}
          </p>
          {intro && (
            <p style={{ ...t.body, marginTop: 22, lineHeight: 1.7 }}>
              {intro}
            </p>
          )}
        </div>

        {/* Sections en 2 colonnes sur desktop, 1 colonne sur mobile.
            Le flux gauche-droite-haut-bas garde l'ordre de lecture des
            articles. */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
            columnGap: 56,
            rowGap: 40,
            alignItems: "start",
          }}
        >
          {sections.map((section) => (
            <section key={section.title}>
              <h2 style={{
                ...t.h3,
                fontFamily: brand.fontDisplay,
                fontWeight: 500,
                fontSize: 19,
                margin: "0 0 16px",
                paddingBottom: 12,
                borderBottom: `1px solid ${brand.border}`,
              }}>
                {section.title}
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {section.content.map((line, i) => {
                  const isBold = line.startsWith("**") && line.endsWith("**")
                  const text = isBold ? line.slice(2, -2) : line
                  return (
                    <p key={i} style={{
                      ...t.body,
                      margin: 0,
                      fontSize: 14,
                      lineHeight: 1.7,
                      color: isBold ? brand.text : brand.textSecondary,
                      fontWeight: isBold ? 600 : 400,
                    }}>
                      {text}
                    </p>
                  )
                })}
              </div>
            </section>
          ))}
        </div>

        {/* Contact — recentré comme le hero pour clore la page proprement. */}
        <div style={{
          maxWidth: 720, margin: "56px auto 0",
          background: brand.surface,
          borderRadius: brand.radiusLg,
          padding: "28px 24px",
          border: `1px solid ${brand.border}`,
        }}>
          <p style={{
            ...t.h3,
            fontFamily: brand.fontDisplay,
            fontWeight: 500,
            fontSize: 18,
            margin: "0 0 6px",
          }}>
            Une question&nbsp;?
          </p>
          <p style={{ ...t.body, fontSize: 14, margin: "0 0 16px" }}>
            Écrivez-nous, nous répondons sous 48 h ouvrées.
          </p>
          <a href="mailto:contact@naywastudio.com" style={{
            ...t.body,
            fontSize: 14,
            fontWeight: 600,
            color: brand.violet,
            textDecoration: "none",
          }}>
            contact@naywastudio.com →
          </a>
        </div>
      </main>

      {/* Footer */}
      <footer style={{
        padding: 24,
        borderTop: `1px solid ${brand.border}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: 16, flexWrap: "wrap",
      }}>
        <Logo size="sm" />
        <span style={{ ...t.caption, fontSize: 12 }}>
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
    </div>
  )
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} style={footerLinkStyle}>{children}</Link>
}

const footerLinkStyle: React.CSSProperties = {
  ...t.caption,
  fontSize: 12,
  textDecoration: "none",
}
