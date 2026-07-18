import Link from "next/link"
import { Navbar } from "@/components/layout/Navbar"
import { Hero } from "@/components/sections/Hero"
import { TrustBar, PricingTeaser } from "@/components/sections/HomeBands"
import { SimulatedDemo } from "@/components/sections/SimulatedDemo"
import { HowItWorks } from "@/components/sections/HowItWorks"
import { WhyNawa } from "@/components/sections/WhyNawa"
import { Founders } from "@/components/sections/Founders"
import { Footer } from "@/components/layout/Footer"
import { BrandBands } from "@/components/ui/BrandBands"
import AuthErrorRedirect from "@/components/layout/AuthErrorRedirect"
import { brand, type as t } from "@/lib/brand"

/**
 * Accueil — parcours de conversion.
 *
 * Ordre : promesse → à qui c'est destiné → PREUVE (la démo) → comment →
 * pourquoi nous → combien → qui nous sommes → agir.
 *
 * La démo simulée monte juste après la promesse : c'est l'asset qui convertit,
 * elle n'a rien à faire en bas de page. `AgentsPreview` a été retiré — la démo
 * raconte la même histoire, en la MONTRANT.
 */
export default function Home() {
  return (
    <>
      <AuthErrorRedirect />
      <BrandBands />
      <Navbar />
      <main style={{ position: "relative", zIndex: 1 }}>
        <Hero />
        <TrustBar />
        <SimulatedDemo />
        <HowItWorks />
        <WhyNawa />
        <PricingTeaser />
        <Founders />

        {/* CTA final — bande encre, pour clore par un contraste franc. */}
        <section style={{ padding: "104px 24px 120px", background: brand.ink }}>
          <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
            <h2 style={{ ...t.h2, color: brand.sable, margin: "0 0 14px" }}>
              Essayez sur votre vrai vivier.
            </h2>
            <p
              style={{
                ...t.body,
                fontSize: 15.5,
                lineHeight: 1.75,
                color: brand.violetSoft,
                margin: "0 0 28px",
              }}
            >
              15 jours offerts, sans carte bancaire. Déposez vos CVs, créez une
              mission, jugez sur pièce.
            </p>
            <Link href="/login?mode=signup" className="nw-btn nw-btn-primary">
              Démarrer votre essai gratuit →
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
