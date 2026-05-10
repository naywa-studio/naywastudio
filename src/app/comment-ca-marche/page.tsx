import type { Metadata } from "next"
import Link from "next/link"
import { Navbar } from "@/components/layout/Navbar"
import { Footer } from "@/components/layout/Footer"

export const metadata: Metadata = {
  title: "Comment ça marche",
  description:
    "Comment Naywa Studio source vos meilleurs candidats LinkedIn et Malt en 2 minutes. Brief en langage naturel, scoring IA, export Excel — sans clé API à configurer.",
}

const STEPS = [
  {
    n: "01",
    title: "Crée ton compte en 30 secondes",
    body:
      "Inscription par email/mot de passe ou Google. Aucune carte bancaire pendant la phase beta. À la connexion tu atterris directement dans ton workspace, pas d’étape intermédiaire.",
    visual: "👋",
  },
  {
    n: "02",
    title: "Décris ton poste à pourvoir",
    body:
      "Dans le chat central, raconte-moi le poste comme tu le ferais à un collègue : « Je cherche un Data Engineer senior à Paris avec 5 ans d’expérience Spark / Python ». Léo te pose une question si une info clé manque (séniorité, lieu, compétences).",
    visual: "💬",
  },
  {
    n: "03",
    title: "Léo crée la mission et lance la recherche",
    body:
      "Léo structure ton brief, le scoring IA est calibré sur tes critères. Il interroge le web (LinkedIn + Malt) en parallèle et collecte jusqu’à 60 profils en quelques secondes. Tu peux confirmer le brief avant de lancer ou laisser Léo enchaîner.",
    visual: "🔍",
  },
  {
    n: "04",
    title: "Les candidats arrivent en temps réel",
    body:
      "Sur la page mission, les candidats s’ajoutent au fur et à mesure (Realtime). Chaque candidat a un score de pertinence 0-100 calculé sur 4 dimensions : compétences, séniorité, localisation, qualité du profil. Tu peux filtrer par source (LinkedIn / Malt) et trier par score.",
    visual: "📊",
  },
  {
    n: "05",
    title: "Tu shortlist et tu exportes",
    body:
      "Marque les candidats que tu retiens, télécharge le tableur Excel structuré (rang, nom, titre, entreprise, score, justification, lien LinkedIn). Le fichier est prêt pour ton ATS ou pour une session de prise de contact.",
    visual: "📁",
  },
] as const

const FAQ = [
  {
    q: "Faut-il un compte LinkedIn pour utiliser Naywa Studio ?",
    a: "Non. Léo cherche les profils publics via le web (Google, Tavily, DuckDuckGo). Pour un sourcing avancé qui enrichit les pages LinkedIn, l’extension Chrome (optionnelle) utilise ta session LinkedIn — ton compte reste sur ta machine, on n’y a jamais accès.",
  },
  {
    q: "Combien de candidats par mission ?",
    a: "Jusqu’à 60 candidats triés par pertinence. Tu peux relancer la même mission avec des mots-clés affinés pour explorer d’autres angles.",
  },
  {
    q: "Quelle différence entre Léo, Nora et Alex ?",
    a: "Léo (disponible) sourçe et score les profils. Nora (bientôt) ajoute l’enrichissement LinkedIn complet et les messages d’approche. Alex (bientôt) prend en charge la prise de contact et le booking d’entretiens. Tu commences sur Léo gratuit pendant la beta.",
  },
  {
    q: "Est-ce conforme au RGPD ?",
    a: "Oui. Naywa Studio ne collecte que les données strictement nécessaires (ton email, tes briefs, les profils publics que tu cherches). Tes missions et candidats restent à toi, pas de revente, pas de partage avec des tiers en dehors de nos providers techniques (Supabase, OpenRouter).",
  },
  {
    q: "Léo se trompe parfois sur un candidat — pourquoi ?",
    a: "Le scoring IA travaille avec les snippets retournés par le moteur de recherche. C’est très bon dans 80-90% des cas, mais sur un poste très niché ou un profil au CV atypique, un score peut être trompeur. Le rang est indicatif, pas autoritaire — juge toujours toi-même.",
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
            maxWidth: "16ch",
            fontFamily: "var(--font-inter), sans-serif",
          }}>
            De votre brief à vos candidats — en 2 minutes.
          </h1>
          <p style={{
            fontSize: "clamp(15px, 1.1vw, 18px)", color: "#4B5563", lineHeight: 1.7,
            margin: "0 0 56px", maxWidth: "60ch",
            fontFamily: "var(--font-inter), sans-serif",
          }}>
            Cinq étapes simples entre l’ouverture de ton compte et la shortlist.
            Pas de paramétrage, pas de clé API, pas d’intégration technique.
          </p>

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
                  fontSize: 22, lineHeight: 1,
                }}>
                  {s.visual}
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
              Prêt à essayer ?
            </h2>
            <p style={{
              margin: "0 0 22px",
              fontSize: 15, color: "rgba(255,255,255,0.78)", lineHeight: 1.6,
              maxWidth: "44ch", marginLeft: "auto", marginRight: "auto",
            }}>
              Crée ton compte gratuit, lance ta première recherche en 2 minutes.
            </p>
            <Link href="/login?mode=signup" style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              padding: "13px 28px", borderRadius: 12,
              background: "white", color: "#7C63C8",
              fontSize: 15, fontWeight: 700, textDecoration: "none",
              boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
            }}>
              Commencer gratuitement →
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
            <Link href="/tarifs" style={{
              color: "#7C63C8", fontSize: 14, fontWeight: 600,
              textDecoration: "none",
            }}>
              Voir les tarifs →
            </Link>
            <Link href="/install" style={{
              color: "#7C63C8", fontSize: 14, fontWeight: 600,
              textDecoration: "none",
            }}>
              Installer l’extension Chrome →
            </Link>
            <Link href="/faq" style={{
              color: "#7C63C8", fontSize: 14, fontWeight: 600,
              textDecoration: "none",
            }}>
              FAQ complète →
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
