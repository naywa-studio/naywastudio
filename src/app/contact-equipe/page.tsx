import Script from "next/script"
import type { Metadata } from "next"
import { Navbar } from "@/components/layout/Navbar"
import { Footer } from "@/components/layout/Footer"
import { MAX_SELF_SERVE_SEATS } from "@/lib/pricing-plan"

/**
 * /contact-equipe — prise de RDV pour les structures au-delà du self-service.
 *
 * Le configurateur (/organisation) et la grille (/tarifs) basculent ici dès que
 * le nombre de personnes dépasse MAX_SELF_SERVE_SEATS : à ce niveau on veut une
 * conversation (périmètre, facturation, onboarding), pas un paiement à l'aveugle.
 *
 * L'embed Lark s'injecte via `next/script` : un <script> écrit directement dans
 * du JSX n'est jamais exécuté par React (il est traité comme du markup inerte).
 * `afterInteractive` = chargé après l'hydratation, sans bloquer le rendu.
 */

export const metadata: Metadata = {
  title: "Parlons de votre équipe — Naywa Studio",
  description:
    "Vous êtes plus de 5 à utiliser Naywa ? Prenez 20 minutes avec l'équipe pour construire l'offre qui correspond à votre structure.",
}

const LARK_SCHEDULER_URL =
  "https://cjp35hkl3bla.jp.larksuite.com/scheduler/embed/7ff72813640fcff3"
const LARK_WIDGET_SCRIPT =
  "https://cjp35hkl3bla.jp.larksuite.com/scheduler/embed/scheduler-widget.js"

export default function ContactEquipePage() {
  return (
    <>
      <Navbar />
      <main
        style={{
          minHeight: "100vh",
          background: "#FFFFFF",
          paddingTop: 96,
          fontFamily: "var(--font-inter), sans-serif",
        }}
      >
        <section style={{ padding: "0 24px 32px", textAlign: "center" }}>
          <div style={{ maxWidth: 640, margin: "0 auto" }}>
            <p
              style={{
                margin: 0,
                fontSize: 11,
                fontWeight: 700,
                color: "#7C63C8",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              Plus de {MAX_SELF_SERVE_SEATS} personnes
            </p>
            <h1
              style={{
                margin: "10px 0 0",
                fontSize: 38,
                lineHeight: 1.15,
                fontWeight: 800,
                color: "#111827",
                letterSpacing: "-0.03em",
                fontFamily: "var(--font-space-grotesk), sans-serif",
              }}
            >
              Parlons de votre équipe
            </h1>
            <p
              style={{
                margin: "14px auto 0",
                maxWidth: 520,
                fontSize: 15,
                lineHeight: 1.65,
                color: "#4B5563",
              }}
            >
              À partir d&apos;une certaine taille, une grille standard ne veut plus dire
              grand-chose. Prenez 20 minutes avec nous : on regarde votre volume, votre
              organisation et vos missions, et on construit l&apos;offre qui colle.
              Vous parlez directement aux fondateurs.
            </p>
          </div>
        </section>

        <section style={{ padding: "0 24px 96px" }}>
          <div
            style={{
              maxWidth: 900,
              margin: "0 auto",
              background: "#F8F6FF",
              border: "1px solid #E2DAF6",
              borderRadius: 20,
              padding: 12,
              boxShadow: "0 12px 40px -16px rgba(124,99,200,0.28)",
            }}
          >
            {/* 626px (la valeur par défaut de l'embed Lark) coupait le
                calendrier : le widget rendait sa propre barre de défilement
                interne, et il fallait scroller DANS le scroll de la page pour
                voir les créneaux. On lui donne la hauteur de son contenu. */}
            <div
              className="scheduler-inline-widget"
              data-url={LARK_SCHEDULER_URL}
              style={{ width: "100%", height: 900 }}
            />
            <noscript>
              <p style={{ padding: 24, textAlign: "center", fontSize: 14, color: "#4B5563" }}>
                La prise de rendez-vous nécessite JavaScript. Écrivez-nous à{" "}
                <a href="mailto:contact@naywastudio.com" style={{ color: "#7C63C8", fontWeight: 600 }}>
                  contact@naywastudio.com
                </a>
                .
              </p>
            </noscript>
          </div>

          <p
            style={{
              maxWidth: 900,
              margin: "16px auto 0",
              textAlign: "center",
              fontSize: 12.5,
              color: "#6B7280",
            }}
          >
            Le créneau ne vous convient pas ? Écrivez-nous à{" "}
            <a href="mailto:contact@naywastudio.com" style={{ color: "#7C63C8", fontWeight: 600 }}>
              contact@naywastudio.com
            </a>
            .
          </p>
        </section>
      </main>
      <Footer />
      <Script src={LARK_WIDGET_SCRIPT} strategy="afterInteractive" />
    </>
  )
}
