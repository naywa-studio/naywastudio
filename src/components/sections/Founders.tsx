"use client"

import { m } from "framer-motion"

/**
 * Founders — short trust section, two cards (Elyas + Hussein).
 *
 * No photos yet, just initial-based avatars in the brand palette. When
 * real photos land, drop them into <Image> tags and remove the SVG fill.
 */

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

const fu = (delay: number) => ({
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.65, delay, ease: EASE },
})

interface Founder {
  initials: string
  name: string
  role: string
  quote: string
  linkedinUrl?: string
  avatarGradient: string
  /** Chemin public optionnel (ex. /founders/elyas.jpg). Si défini,
   *  remplace l'avatar à initiales. */
  photoUrl?: string
}

const FOUNDERS: Founder[] = [
  {
    initials: "EM",
    name: "Elyas Malki",
    role: "Fondateur — Produit & Tech",
    quote:
      "J'ai construit Naywa parce que je voulais que l'IA travaille pour les sourceurs, pas à leur place. Nora propose, vous décidez.",
    linkedinUrl: "https://www.linkedin.com/in/elyas-malki-2a6b7933a/",
    avatarGradient: "linear-gradient(135deg, #7C63C8 0%, #B8AEDE 100%)",
    photoUrl: "/elyas.jpg",
  },
  {
    initials: "HM",
    name: "Hussein Malki",
    role: "Direction artistique & Marque",
    quote:
      "On veut un produit qui se voit, se comprend, et qu'on a envie d'utiliser. La marque Naywa doit faire ressentir tout ça dès le premier coup d'œil.",
    avatarGradient: "linear-gradient(135deg, #B8AEDE 0%, #7C63C8 100%)",
  },
]

export function Founders() {
  return (
    <section
      id="fondateurs"
      style={{
        background: "rgba(248,246,255,0.4)",
        padding: "112px 24px",
        borderTop: "1px solid rgba(240,236,248,0.6)",
        position: "relative",
      }}
    >
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        {/* Header */}
        <m.div
          {...fu(0)}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            gap: 14,
            marginBottom: 56,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#7C63C8",
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              fontFamily: "var(--font-inter), sans-serif",
            }}
          >
            Qui sommes-nous&nbsp;?
          </span>
          <h2
            style={{
              fontFamily: "var(--font-title), sans-serif",
              fontSize: "clamp(28px, 4vw, 44px)",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "#111827",
              margin: 0,
              lineHeight: 1.1,
            }}
          >
            Une équipe{" "}
            <span
              style={{
                fontFamily: "var(--font-accent), serif",
                fontWeight: 400,
                fontStyle: "italic",
                color: "#7C63C8",
              }}
            >
              à taille humaine
            </span>
            .
          </h2>
          <p
            style={{
              fontFamily: "var(--font-inter), sans-serif",
              fontSize: 15,
              color: "#4B5563",
              lineHeight: 1.7,
              maxWidth: "55ch",
              margin: 0,
            }}
          >
            Naywa Studio est un projet porté par ses fondateurs. Vous échangez
            directement avec les personnes qui conçoivent le produit, le
            développent et le font évoluer — pas avec un support de niveau 1.
          </p>
        </m.div>

        {/* Founders grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 24,
          }}
          className="founders-grid"
        >
          {FOUNDERS.map((founder, i) => (
            <m.article
              key={founder.name}
              {...fu(0.10 + i * 0.08)}
              style={{
                background: "white",
                border: "1px solid #F0ECF8",
                borderRadius: 20,
                padding: "32px 28px",
                display: "flex",
                flexDirection: "column",
                gap: 18,
                boxShadow: "0 4px 24px rgba(124,99,200,0.06)",
                transition: "transform 200ms ease, box-shadow 200ms ease",
              }}
              whileHover={{ y: -4 }}
            >
              {/* Avatar + identity */}
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div
                  aria-hidden
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: "50%",
                    background: founder.photoUrl
                      ? `url(${founder.photoUrl}) center/cover no-repeat, ${founder.avatarGradient}`
                      : founder.avatarGradient,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "white",
                    fontFamily: "var(--font-inter), sans-serif",
                    fontWeight: 700,
                    fontSize: 22,
                    letterSpacing: "-0.02em",
                    boxShadow: "0 4px 12px rgba(124,99,200,0.25)",
                    flexShrink: 0,
                  }}
                >
                  {!founder.photoUrl && founder.initials}
                </div>
                <div style={{ minWidth: 0 }}>
                  <h3
                    style={{
                      fontFamily: "var(--font-inter), sans-serif",
                      fontSize: 17,
                      fontWeight: 700,
                      color: "#111827",
                      margin: 0,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {founder.name}
                  </h3>
                  <p
                    style={{
                      fontFamily: "var(--font-inter), sans-serif",
                      fontSize: 13,
                      color: "#7C63C8",
                      margin: "3px 0 0",
                      fontWeight: 600,
                    }}
                  >
                    {founder.role}
                  </p>
                </div>
              </div>

              {/* Quote */}
              <blockquote
                style={{
                  fontFamily: "var(--font-inter), sans-serif",
                  fontSize: 14.5,
                  fontStyle: "italic",
                  color: "#374151",
                  lineHeight: 1.7,
                  margin: 0,
                  padding: "0 0 0 14px",
                  borderLeft: "2px solid #E2DAF6",
                }}
              >
                &laquo; {founder.quote} &raquo;
              </blockquote>

              {/* LinkedIn link */}
              {founder.linkedinUrl && (
                <a
                  href={founder.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontFamily: "var(--font-inter), sans-serif",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#7C63C8",
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    marginTop: "auto",
                    transition: "color 150ms ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "#6B54B2"
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "#7C63C8"
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden
                  >
                    <path d="M19 0h-14C2.239 0 0 2.239 0 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5V5c0-2.761-2.238-5-5-5zM8 19H5V8h3v11zM6.5 6.732c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zM20 19h-3v-5.604c0-3.368-4-3.113-4 0V19h-3V8h3v1.765c1.396-2.586 7-2.777 7 2.476V19z" />
                  </svg>
                  Voir sur LinkedIn
                </a>
              )}
            </m.article>
          ))}
        </div>
      </div>

      <style>{`
        @media (max-width: 720px) {
          .founders-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </section>
  )
}
