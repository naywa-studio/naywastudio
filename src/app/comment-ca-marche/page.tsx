import type { Metadata } from "next"
import Link from "next/link"
import { Navbar } from "@/components/layout/Navbar"
import { Footer } from "@/components/layout/Footer"

export const metadata: Metadata = {
  title: "Comment ça marche",
  description:
    "Comment Naywa Studio (Nora) organise votre vivier de CVs, le match avec vos missions, calcule la marge Syntec et anonymise les profils à présenter — sans clé API à configurer.",
}

const STEPS = [
  {
    n: "01",
    title: "Importez vos CVs dans le vivier",
    body:
      "Drag-drop n'importe quel CV : PDF, DOCX, photo. Nora extrait automatiquement le nom, l'expérience, les compétences, la localisation et les coordonnées. Tout est indexé et recherchable dans votre vivier privé.",
    icon: (
      <>
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </>
    ),
  },
  {
    n: "02",
    title: "Décrivez vos missions",
    body:
      "Un brief court par mission (titre, lieu, séniorité, compétences clés). Nora score automatiquement TOUS les candidats du vivier contre cette mission avec une justification claire sur chaque match.",
    icon: (
      <>
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </>
    ),
  },
  {
    n: "03",
    title: "Recevez vos shortlists triées",
    body:
      "Pour chaque mission, vos meilleurs candidats classés. Les profils sont groupés par qualité de match (excellent / bon / moyen). Vous gagnez des heures de tri manuel.",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="12" r="1.5" />
      </>
    ),
  },
  {
    n: "04",
    title: "Anonymisez en 1 clic",
    body:
      "Cliquez « Anonymiser » sur un candidat : Nora génère un PDF sans nom, photo, contacts ni écoles précises. Prêt à présenter à votre client pour une décision sans biais.",
    icon: (
      <>
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </>
    ),
  },
  {
    n: "05",
    title: "Suivez le pipeline et le pricing",
    body:
      "Identifié → Contacté → Réponse → Entretien → Offre. Nora suggère les relances au bon moment et calcule la marge Syntec sur chaque chiffrage candidat × mission.",
    icon: (
      <>
        <path d="M3 12h4l3 8 4-16 3 8h4" />
      </>
    ),
  },
] as const

const FAQ = [
  {
    q: "Naywa Studio cherche-t-il les candidats à ma place ?",
    a: "Non — vous gardez la main sur le sourcing (LinkedIn Recruiter, jobboards, votre réseau). Nora prend le relais une fois que les CVs entrent dans votre vivier : elle range, score, match, anonymise et suit. L'humain choisit, l'IA gère la friction.",
  },
  {
    q: "Quels formats de CV sont supportés ?",
    a: "PDF (le plus courant), DOCX (Word), et photos (JPG/PNG via OCR). Les CVs scannés sont supportés mais le parsing est meilleur sur les PDF natifs.",
  },
  {
    q: "Combien de CVs / postes je peux gérer ?",
    a: "Illimité pendant la beta privée. La tarification publique post-beta sera basée sur le volume mensuel parsé.",
  },
  {
    q: "L'anonymisation est-elle réversible ?",
    a: "Oui — le CV original reste dans votre vivier. La version anonymisée est un export PDF séparé. Vous pouvez la régénérer à tout moment.",
  },
  {
    q: "Mes données sont-elles confidentielles ?",
    a: "Vos CVs et candidats restent à vous. Aucune revente, aucun partage hors providers techniques (Supabase, OpenRouter pour le LLM). Vous pouvez exporter ou supprimer tout votre vivier à n'importe quel moment.",
  },
] as const

export default function HowItWorksPage() {
  return (
    <div style={{ background: "#FAFAFA", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Navbar />

      <main style={{ flex: 1, padding: "120px 24px 80px" }}>
        <div style={{ maxWidth: 920, margin: "0 auto" }}>
          {/* Hero */}
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            background: "rgba(124,99,200,0.08)", border: "1px solid rgba(124,99,200,0.18)",
            borderRadius: 999, padding: "5px 13px",
            marginBottom: 22,
            fontSize: 11, fontWeight: 700, color: "#7C63C8",
            letterSpacing: "0.07em", textTransform: "uppercase",
            fontFamily: "var(--font-inter), sans-serif",
          }}>
            Comment ça marche
          </span>

          <h1 style={{
            fontSize: "clamp(34px, 5vw, 56px)", fontWeight: 800, color: "#111827",
            letterSpacing: "-0.03em", lineHeight: 1.06,
            margin: "0 0 18px",
            maxWidth: "20ch",
            fontFamily: "var(--font-inter), sans-serif",
          }}>
            De votre vivier brut à vos shortlists, sans friction.
          </h1>
          <p style={{
            fontSize: "clamp(15px, 1.1vw, 18px)", color: "#4B5563", lineHeight: 1.7,
            margin: "0 0 22px", maxWidth: "62ch",
            fontFamily: "var(--font-inter), sans-serif",
          }}>
            Cinq étapes. Vous gardez la main sur le sourcing, Nora gère la
            partie cognitive lourde — parsing, matching, anonymisation, suivi.
          </p>

          {/* Trial reassurance */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "8px 14px", borderRadius: 999,
            border: "1px solid rgba(34,197,94,0.30)",
            background: "rgba(34,197,94,0.06)",
            color: "#15803D",
            fontFamily: "var(--font-inter), sans-serif",
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 56,
          }}>
            <span aria-hidden style={{
              width: 7, height: 7, borderRadius: "50%",
              background: "#22C55E",
              boxShadow: "0 0 0 4px rgba(34,197,94,0.18)",
              display: "inline-block",
            }} />
            <strong>15 jours offerts</strong> · sans carte · résiliable à tout moment
          </div>

          {/* Steps */}
          <ol style={{
            listStyle: "none",
            padding: 0,
            margin: "0 0 80px",
            display: "flex", flexDirection: "column", gap: 18,
          }}>
            {STEPS.map((s) => (
              <li key={s.n} style={{
                display: "flex", gap: 22,
                background: "white", borderRadius: 16,
                border: "1px solid #F0ECF8",
                padding: "24px 28px",
                fontFamily: "var(--font-inter), sans-serif",
              }}>
                <div style={{
                  flexShrink: 0,
                  width: 44, height: 44, borderRadius: 12,
                  background: "rgba(124,99,200,0.08)",
                  border: "1px solid rgba(124,99,200,0.18)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#7C63C8",
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    {s.icon}
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    margin: "0 0 6px",
                    fontSize: 11, fontWeight: 700, color: "#7C63C8",
                    letterSpacing: "0.08em", textTransform: "uppercase",
                  }}>
                    Étape {s.n}
                  </p>
                  <h2 style={{
                    margin: "0 0 8px",
                    fontSize: 19, fontWeight: 700, color: "#111827",
                    letterSpacing: "-0.012em",
                  }}>
                    {s.title}
                  </h2>
                  <p style={{
                    margin: 0,
                    fontSize: 14.5, color: "#4B5563", lineHeight: 1.65,
                  }}>
                    {s.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          {/* CTA inter-section */}
          <div style={{
            background: "linear-gradient(135deg, #7C63C8 0%, #6952B8 60%, #5A42A8 100%)",
            borderRadius: 20,
            padding: "44px 36px",
            textAlign: "center",
            marginBottom: 80,
            fontFamily: "var(--font-inter), sans-serif",
            color: "white",
          }}>
            <h2 style={{
              margin: "0 0 10px",
              fontSize: "clamp(22px, 2.5vw, 30px)", fontWeight: 800,
              letterSpacing: "-0.02em",
            }}>
              Prêt à organiser votre vivier ?
            </h2>
            <p style={{
              margin: "0 0 22px",
              fontSize: 15, color: "rgba(255,255,255,0.78)", lineHeight: 1.6,
              maxWidth: "46ch", marginLeft: "auto", marginRight: "auto",
            }}>
              Rejoignez la beta privée — gratuit, aucune carte bancaire.
            </p>
            <Link href="/login?mode=signup" style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              padding: "13px 28px", borderRadius: 12,
              background: "white", color: "#7C63C8",
              fontSize: 15, fontWeight: 700, textDecoration: "none",
              boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
            }}>
              Rejoindre la beta →
            </Link>
          </div>

          {/* FAQ */}
          <div style={{ marginBottom: 24 }}>
            <h2 style={{
              fontSize: "clamp(22px, 2.6vw, 32px)", fontWeight: 800, color: "#111827",
              letterSpacing: "-0.025em", lineHeight: 1.15,
              margin: "0 0 28px",
              fontFamily: "var(--font-inter), sans-serif",
            }}>
              Questions fréquentes
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {FAQ.map((f) => (
                <details key={f.q} style={{
                  background: "white", borderRadius: 12,
                  border: "1px solid #F0ECF8",
                  padding: "16px 20px",
                  fontFamily: "var(--font-inter), sans-serif",
                }}>
                  <summary style={{
                    cursor: "pointer", listStyle: "none",
                    fontSize: 15, fontWeight: 700, color: "#111827",
                    display: "flex", alignItems: "center", gap: 10,
                  }}>
                    <span style={{ fontSize: 13, color: "#7C63C8" }}>›</span>
                    {f.q}
                  </summary>
                  <p style={{
                    margin: "10px 0 0 22px",
                    fontSize: 14, color: "#4B5563", lineHeight: 1.65,
                  }}>
                    {f.a}
                  </p>
                </details>
              ))}
            </div>
          </div>

          {/* Secondary links */}
          <div style={{
            marginTop: 56, paddingTop: 28,
            borderTop: "1px solid #F0ECF8",
            display: "flex", flexWrap: "wrap", gap: 14,
            fontFamily: "var(--font-inter), sans-serif",
          }}>
            <Link href="/tarifs" style={{ color: "#7C63C8", fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
              Voir les tarifs →
            </Link>
            <Link href="/faq" style={{ color: "#7C63C8", fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
              FAQ complète →
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
