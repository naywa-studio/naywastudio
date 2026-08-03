"use client"

import Link from "next/link"
import { m } from "framer-motion"
import { useLanguage } from "@/lib/i18n/LanguageContext"
import { Eyebrow } from "@/components/brand/Eyebrow"
import { brand } from "@/lib/brand"

/**
 * Équipe — section de confiance, une carte par personne.
 *
 * Les portraits sont des ILLUSTRATIONS AU TRAIT dans le violet de marque
 * (`/public/founders/`), pas des photos : elles tiennent la charte bien mieux
 * qu'un portrait photographique, qui ramènerait ses propres couleurs.
 *
 * L'avatar à initiales reste en repli si `photoUrl` est absent — utile tant
 * qu'un membre n'a pas encore son illustration.
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
  linkedinUrl?: string
  avatarGradient: string
  /** Chemin public optionnel (ex. /founders/elyas.png). Si défini,
   *  remplace l'avatar à initiales. */
  photoUrl?: string
}

const FOUNDERS: Record<'fr' | 'en', Founder[]> = {
  fr: [
    {
      initials: "EM",
      name: "Elyas Malki",
      role: "Fondateur — Produit & Tech",
      linkedinUrl: "https://www.linkedin.com/in/elyas-malki-2a6b7933a/",
      avatarGradient: "linear-gradient(135deg, #7B63C8 0%, #B8AEDE 100%)",
      photoUrl: "/founders/elyas.png",
    },
    {
      initials: "HM",
      name: "Hussein Malki",
      role: "Direction artistique & Marque",
      linkedinUrl: "https://www.linkedin.com/in/hussein-malki/",
      avatarGradient: "linear-gradient(135deg, #B8AEDE 0%, #7B63C8 100%)",
      photoUrl: "/founders/hussein.png",
    },
    {
      initials: "RB",
      name: "Raphael Bredin",
      role: "Business Developer",
      linkedinUrl: "https://www.linkedin.com/in/raphaelbredin/",
      avatarGradient: "linear-gradient(135deg, #7B63C8 0%, #B8AEDE 100%)",
      photoUrl: "/founders/raphael.png",
    },
    {
      initials: "MM",
      name: "Maryia Malki",
      role: "Technical Lead",
      linkedinUrl: "https://www.linkedin.com/in/maryia-malki-a0489a39b/",
      avatarGradient: "linear-gradient(135deg, #B8AEDE 0%, #7B63C8 100%)",
    },
    {
      initials: "AE",
      name: "Amine Errabih",
      role: "Technical Lead",
      linkedinUrl: "https://www.linkedin.com/in/amine-errabih/",
      avatarGradient: "linear-gradient(135deg, #7B63C8 0%, #B8AEDE 100%)",
    },
  ],
  en: [
    {
      initials: "EM",
      name: "Elyas Malki",
      role: "Founder — Product & Tech",
      linkedinUrl: "https://www.linkedin.com/in/elyas-malki-2a6b7933a/",
      avatarGradient: "linear-gradient(135deg, #7B63C8 0%, #B8AEDE 100%)",
      photoUrl: "/founders/elyas.png",
    },
    {
      initials: "HM",
      name: "Hussein Malki",
      role: "Art Direction & Brand",
      linkedinUrl: "https://www.linkedin.com/in/hussein-malki/",
      avatarGradient: "linear-gradient(135deg, #B8AEDE 0%, #7B63C8 100%)",
      photoUrl: "/founders/hussein.png",
    },
    {
      initials: "RB",
      name: "Raphael Bredin",
      role: "Business Developer",
      linkedinUrl: "https://www.linkedin.com/in/raphaelbredin/",
      avatarGradient: "linear-gradient(135deg, #7B63C8 0%, #B8AEDE 100%)",
      photoUrl: "/founders/raphael.png",
    },
    {
      initials: "MM",
      name: "Maryia Malki",
      role: "Technical Lead",
      linkedinUrl: "https://www.linkedin.com/in/maryia-malki-a0489a39b/",
      avatarGradient: "linear-gradient(135deg, #B8AEDE 0%, #7B63C8 100%)",
    },
    {
      initials: "AE",
      name: "Amine Errabih",
      role: "Technical Lead",
      linkedinUrl: "https://www.linkedin.com/in/amine-errabih/",
      avatarGradient: "linear-gradient(135deg, #7B63C8 0%, #B8AEDE 100%)",
    },
  ],
}

const copy = {
  fr: {
    badge: "Qui sommes-nous ?",
    titlePre: "Une équipe ",
    titleItalic: "à taille humaine",
    titleSuffix: ".",
    desc:
      "Derrière Naywa Studio, une équipe à taille humaine. Vous échangez directement avec les personnes qui conçoivent le produit, le développent et le font évoluer — jamais avec un support de niveau 1.",
    linkedin: "Voir sur LinkedIn",
    cta: "Nous rencontrer",
    ctaHint: "20 minutes avec l'équipe, en visio.",
  },
  en: {
    badge: "Who we are",
    titlePre: "A small, ",
    titleItalic: "hands-on",
    titleSuffix: " team.",
    desc:
      "Behind Naywa Studio, a small, hands-on team. You talk directly with the people who design the product, build it, and evolve it — never with tier-1 support.",
    linkedin: "View on LinkedIn",
    cta: "Meet the team",
    ctaHint: "20 minutes with the team, over video.",
  },
}

export function Founders() {
  const { lang } = useLanguage()
  const t = copy[lang]
  const founders = FOUNDERS[lang]
  return (
    <section
      id="fondateurs"
      style={{
        // Transparent, pas de voile : la section posait un lavande froid
        // par-dessus le marbre du fond, qui disparaissait derrière. Les autres
        // sections de l'accueil laissent déjà le fond respirer.
        background: "transparent",
        padding: "112px 24px",
        borderTop: `1px solid ${brand.border}`,
        position: "relative",
      }}
    >
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
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
          <Eyebrow n="05" align="center">{t.badge}</Eyebrow>
          <h2
            style={{
              fontFamily: "var(--font-fraunces), serif",
              fontSize: "clamp(28px, 4vw, 44px)",
              fontWeight: 800,
              letterSpacing: "-0.02em",
              color: brand.ink,
              margin: 0,
              lineHeight: 1.1,
            }}
          >
            {t.titlePre}
            <span
              style={{
                fontFamily: "var(--font-fraunces), serif",
                fontWeight: 400,
                fontStyle: "italic",
                color: "#7B63C8",
              }}
            >
              {t.titleItalic}
            </span>
            {t.titleSuffix}
          </h2>
          <p
            style={{
              fontFamily: "var(--font-inter), sans-serif",
              fontSize: 15,
              color: brand.textSecondary,
              lineHeight: 1.7,
              maxWidth: "55ch",
              margin: 0,
            }}
          >
            {t.desc}
          </p>
        </m.div>

        {/* Équipe — flex + wrap centré : la dernière rangée incomplète (2 cartes
            sur 3, ou 1 sur 2) se centre au lieu de rester collée à gauche. La
            largeur des cartes est pilotée en CSS (.founder-card) pour rester
            identique d'une rangée à l'autre. */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: 24,
          }}
          className="founders-grid"
        >
          {founders.map((founder, i) => (
            <m.article
              key={founder.name}
              className="founder-card"
              {...fu(0.10 + i * 0.08)}
              style={{
                boxSizing: "border-box",
                background: brand.surface,
                border: `1px solid ${brand.border}`,
                borderRadius: 20,
                padding: "32px 28px",
                display: "flex",
                flexDirection: "column",
                gap: 18,
                boxShadow: "0 4px 24px rgba(123,99,200,0.06)",
                transition: "transform 200ms ease, box-shadow 200ms ease",
              }}
              whileHover={{ y: -4 }}
            >
              {/* Avatar + identity */}
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div
                  aria-hidden
                  style={{
                    // 88px et non 64 : les portraits sont des illustrations au
                    // TRAIT FIN. Sous ~80px, les lignes se confondent et le
                    // dessin devient une tache grise — autant ne rien mettre.
                    width: 88,
                    height: 88,
                    borderRadius: "50%",
                    // Les PNG ont un fond blanc : on met du blanc DESSOUS, pas
                    // le dégradé violet, qui déborderait sur le pourtour.
                    background: founder.photoUrl
                      ? `url(${founder.photoUrl}) center/cover no-repeat, #FFFFFF`
                      : founder.avatarGradient,
                    // Anneau lin : détache le cercle blanc de la carte craie.
                    border: founder.photoUrl ? `1px solid ${brand.border}` : "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "white",
                    fontFamily: "var(--font-inter), sans-serif",
                    fontWeight: 700,
                    fontSize: 26,
                    letterSpacing: "-0.02em",
                    boxShadow: founder.photoUrl
                      ? "0 2px 10px rgba(26,27,46,0.06)"
                      : "0 4px 12px rgba(123,99,200,0.25)",
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
                      color: brand.ink,
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
                      color: "#7B63C8",
                      margin: "3px 0 0",
                      fontWeight: 600,
                    }}
                  >
                    {founder.role}
                  </p>
                </div>
              </div>

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
                    color: "#7B63C8",
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    marginTop: "auto",
                    transition: "color 150ms ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "#4B3A8F"
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "#7B63C8"
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
                  {t.linkedin}
                </a>
              )}
            </m.article>
          ))}
        </div>

        {/* CTA — prise de rendez-vous (embed Lark sur /nous-rencontrer). Bouton
            violet plat de la charte vitrine (jamais de dégradé sur surface). */}
        <m.div
          {...fu(0.10 + founders.length * 0.08 + 0.05)}
          style={{
            marginTop: 48,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Link
            href="/nous-rencontrer"
            style={{
              background: brand.violet,
              color: brand.white,
              borderRadius: brand.radiusMd,
              padding: "14px 30px",
              fontSize: 15,
              fontWeight: 700,
              textDecoration: "none",
              fontFamily: brand.fontBody,
              letterSpacing: "-0.01em",
              boxShadow: brand.shadowViolet,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              transition: "all 200ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)"
              e.currentTarget.style.background = brand.violetDeep
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)"
              e.currentTarget.style.background = brand.violet
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect x="3" y="4.5" width="18" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
              <path d="M3 9h18M8 3v3M16 3v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            {t.cta}
          </Link>
          <p
            style={{
              margin: 0,
              fontFamily: brand.fontBody,
              fontSize: 12.5,
              color: brand.textMuted,
            }}
          >
            {t.ctaHint}
          </p>
        </m.div>
      </div>

      <style>{`
        .founder-card {
          flex: 0 0 calc((100% - 48px) / 3);
          max-width: calc((100% - 48px) / 3);
        }
        @media (max-width: 980px) {
          .founder-card {
            flex-basis: calc((100% - 24px) / 2);
            max-width: calc((100% - 24px) / 2);
          }
        }
        @media (max-width: 640px) {
          .founder-card {
            flex-basis: 100%;
            max-width: 100%;
          }
        }
      `}</style>
    </section>
  )
}
