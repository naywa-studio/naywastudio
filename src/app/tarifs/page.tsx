import type { Metadata } from "next"
import Link from "next/link"
import { Navbar } from "@/components/layout/Navbar"
import { Footer } from "@/components/layout/Footer"
import { ShaderBackground } from "@/components/ui/ShaderBackground"

export const metadata: Metadata = {
  title: "Tarifs",
  description:
    "15 jours d'essai gratuit, sans carte. La grille tarifaire publique de Naywa Studio (Package Sourcing) sera communiquée à l'ouverture officielle de la beta.",
}

const INCLUDED = [
  {
    label: "Vivier illimité",
    body: "Upload PDF, parsing IA, clustering Nora. Autant de candidats que vous voulez.",
  },
  {
    label: "Missions et matching",
    body: "Création par brief, extraction LLM, scoring justifié pour chaque candidat.",
  },
  {
    label: "Anonymisation 1 clic",
    body: "PDF anonymisé brandé au logo de votre cabinet, prêt à présenter au client.",
  },
  {
    label: "Pricing Syntec automatisé",
    body: "Engine de pricing Syntec maison, export PDF pour vos offres commerciales.",
  },
  {
    label: "Pipeline candidat partagé",
    body: "Kanban avec votre équipe, vivier partagé, missions assignables.",
  },
  {
    label: "Support fondateurs",
    body: "Vous parlez directement à Elyas et Hussein. Pas de tier-1, pas de chatbot.",
  },
] as const

export default function TarifsPage() {
  return (
    <>
      <ShaderBackground />
      <Navbar />

      <main style={{ position: "relative", zIndex: 1, paddingTop: 120 }}>
        {/* Hero */}
        <section style={{ padding: "0 24px 56px", textAlign: "center" }}>
          <div style={{ maxWidth: 740, margin: "0 auto" }}>
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
              Tarifs
            </span>
            <h1
              style={{
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: "clamp(34px, 5vw, 56px)",
                fontWeight: 800,
                color: "#111827",
                margin: "14px 0 18px",
                lineHeight: 1.05,
                letterSpacing: "-0.025em",
              }}
            >
              Essayez{" "}
              <span
                style={{
                  fontFamily: "var(--font-instrument-serif), serif",
                  fontWeight: 400,
                  fontStyle: "italic",
                  color: "#7C63C8",
                }}
              >
                gratuitement
              </span>{" "}
              pendant 15 jours.
            </h1>
            <p
              style={{
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: 16,
                color: "#4B5563",
                lineHeight: 1.7,
                margin: "0 auto",
                maxWidth: "55ch",
              }}
            >
              La grille tarifaire publique sera communiquée à l&apos;ouverture
              officielle de la beta. En attendant, votre cabinet a accès au
              workspace complet pendant 15 jours, sans carte bancaire.
            </p>
          </div>
        </section>

        {/* Package card */}
        <section style={{ padding: "0 24px 56px" }}>
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            <article
              style={{
                position: "relative",
                background: "white",
                borderRadius: 24,
                border: "1.5px solid rgba(124,99,200,0.30)",
                padding: "44px 36px 36px",
                boxShadow: "0 20px 48px -16px rgba(124,99,200,0.18)",
              }}
            >
              {/* Top ribbon */}
              <div
                style={{
                  position: "absolute",
                  top: -14,
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
                  color: "white",
                  fontFamily: "var(--font-inter), sans-serif",
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "5px 16px",
                  borderRadius: 999,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  boxShadow: "0 8px 20px -6px rgba(124,99,200,0.55)",
                }}
              >
                Essai gratuit 15 jours
              </div>

              <header style={{ marginBottom: 24 }}>
                <p
                  style={{
                    fontFamily: "var(--font-inter), sans-serif",
                    margin: "0 0 6px",
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: "#7C63C8",
                    letterSpacing: "0.10em",
                    textTransform: "uppercase",
                  }}
                >
                  Le package
                </p>
                <h2
                  style={{
                    fontFamily: "var(--font-inter), sans-serif",
                    margin: 0,
                    fontSize: 28,
                    fontWeight: 800,
                    color: "#111827",
                    letterSpacing: "-0.02em",
                    lineHeight: 1.15,
                  }}
                >
                  Package Sourcing
                </h2>
                <p
                  style={{
                    fontFamily: "var(--font-inter), sans-serif",
                    margin: "6px 0 0",
                    fontSize: 14,
                    color: "#6B7280",
                  }}
                >
                  Tout le workspace Nora pour votre cabinet, partagé entre vos
                  collègues.
                </p>
              </header>

              {/* Price block */}
              <div
                style={{
                  borderTop: "1px solid rgba(124,99,200,0.18)",
                  borderBottom: "1px solid rgba(124,99,200,0.18)",
                  padding: "22px 0",
                  marginBottom: 24,
                  display: "flex",
                  alignItems: "flex-end",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-inter), sans-serif",
                    fontSize: 42,
                    fontWeight: 800,
                    color: "#111827",
                    lineHeight: 1,
                    letterSpacing: "-0.025em",
                  }}
                >
                  Gratuit
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-inter), sans-serif",
                    fontSize: 14,
                    color: "#9CA3AF",
                    paddingBottom: 4,
                  }}
                >
                  pendant 15 jours · puis tarification à venir
                </span>
              </div>

              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: "0 0 28px",
                  display: "grid",
                  gap: 14,
                }}
              >
                {INCLUDED.map((feat) => (
                  <li
                    key={feat.label}
                    style={{
                      display: "flex",
                      gap: 14,
                      alignItems: "flex-start",
                      fontFamily: "var(--font-inter), sans-serif",
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        background: "rgba(124,99,200,0.10)",
                        color: "#7C63C8",
                        flexShrink: 0,
                        marginTop: 2,
                      }}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                    <div>
                      <p
                        style={{
                          margin: 0,
                          fontSize: 14,
                          fontWeight: 700,
                          color: "#111827",
                        }}
                      >
                        {feat.label}
                      </p>
                      <p
                        style={{
                          margin: "2px 0 0",
                          fontSize: 13,
                          color: "#6B7280",
                          lineHeight: 1.55,
                        }}
                      >
                        {feat.body}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>

              <Link
                href="/login?mode=signup"
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: 6,
                  background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
                  color: "white",
                  fontFamily: "var(--font-inter), sans-serif",
                  fontSize: 15,
                  fontWeight: 700,
                  padding: "14px 24px",
                  borderRadius: 12,
                  textDecoration: "none",
                  boxShadow: "0 8px 24px -6px rgba(124,99,200,0.55)",
                  width: "100%",
                  boxSizing: "border-box",
                }}
              >
                Démarrer mes 15 jours gratuits →
              </Link>
              <p
                style={{
                  margin: "12px 0 0",
                  fontFamily: "var(--font-inter), sans-serif",
                  fontSize: 12,
                  color: "#9CA3AF",
                  textAlign: "center",
                  lineHeight: 1.55,
                }}
              >
                Aucune carte requise. Vous gardez l&apos;accès à votre cabinet
                même après l&apos;essai, sans coupure brutale.
              </p>
            </article>
          </div>
        </section>

        {/* FAQ mini */}
        <section style={{ padding: "0 24px 96px" }}>
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            <h3
              style={{
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: 18,
                fontWeight: 700,
                color: "#111827",
                margin: "0 0 18px",
                letterSpacing: "-0.01em",
              }}
            >
              Questions fréquentes
            </h3>
            <div style={{ display: "grid", gap: 12 }}>
              {FAQ.map((q) => (
                <details
                  key={q.q}
                  style={{
                    background: "white",
                    border: "1px solid #F0ECF8",
                    borderRadius: 12,
                    padding: "14px 18px",
                    fontFamily: "var(--font-inter), sans-serif",
                  }}
                >
                  <summary
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#111827",
                      cursor: "pointer",
                      listStyle: "none",
                    }}
                  >
                    {q.q}
                  </summary>
                  <p
                    style={{
                      margin: "10px 0 0",
                      fontSize: 13.5,
                      color: "#4B5563",
                      lineHeight: 1.65,
                    }}
                  >
                    {q.a}
                  </p>
                </details>
              ))}
            </div>
            <p
              style={{
                margin: "24px 0 0",
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: 13.5,
                color: "#6B7280",
                textAlign: "center",
              }}
            >
              Une autre question ?{" "}
              <Link
                href="/contact"
                style={{ color: "#7C63C8", fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 2 }}
              >
                Écrivez-nous
              </Link>
              .
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </>
  )
}

const FAQ = [
  {
    q: "Est-ce que je dois renseigner une carte bancaire ?",
    a: "Non. L'essai gratuit de 15 jours ne demande aucune carte. À l'expiration, vous gardez l'accès à votre cabinet et nous vous proposerons un abonnement adapté.",
  },
  {
    q: "Que se passe-t-il à la fin des 15 jours ?",
    a: "Pas de coupure brutale. Vous continuez d'accéder à votre cabinet et nous prenons contact pour vous proposer un abonnement adapté à votre équipe. La facturation se mettra en place une fois que vous aurez validé.",
  },
  {
    q: "Quelle est la grille tarifaire publique ?",
    a: "Elle sera annoncée à la sortie de beta, avec des paliers par taille d'équipe (1 siège, jusqu'à 5 sièges, illimité). Les premiers cabinets bénéficieront d'un tarif préférentiel à vie.",
  },
  {
    q: "Combien de sièges sont inclus pendant l'essai ?",
    a: "Tous vos membres invités occupent un siège, sans limite pendant la période d'essai. La facturation au siège commencera uniquement quand vous activerez votre abonnement.",
  },
] as const
