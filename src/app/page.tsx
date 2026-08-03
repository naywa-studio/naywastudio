import { Navbar } from "@/components/layout/Navbar"
import { Hero } from "@/components/sections/Hero"
import { TrustBar, NoraIntro, PricingTeaser } from "@/components/sections/HomeBands"
import { HowItWorks } from "@/components/sections/HowItWorks"
import { WhyNawa } from "@/components/sections/WhyNawa"
import { Founders } from "@/components/sections/Founders"
import { FinalCTA } from "@/components/sections/FinalCTA"
import { Footer } from "@/components/layout/Footer"
import { ShaderBackground } from "@/components/ui/ShaderBackground"
import AuthErrorRedirect from "@/components/layout/AuthErrorRedirect"

/**
 * Accueil — parcours de conversion (charte v2.0).
 *
 * Ordre : promesse → garanties → QUI est Nora → comment → pourquoi nous →
 * combien → qui nous sommes → agir.
 *
 * `NoraIntro` vient tôt à dessein : sans elle, « Nora » apparaît plus bas
 * dans la page sans qu'on sache ce que c'est. Elle remplace `AgentsPreview`,
 * qui présentait Nora comme un agent parmi d'autres dans un catalogue
 * imaginaire (le composant reste au dépôt, plus référencé nulle part).
 *
 * `PricingTeaser` avant les fondateurs : sans ordre de grandeur sur la page,
 * beaucoup partent chercher le prix et ne reviennent pas.
 *
 * ⚠️ EMPLACEMENT DÉMO — une démonstration animée doit venir ICI, entre
 * `NoraIntro` et `HowItWorks` : on explique QUI est Nora, on la MONTRE au
 * travail, puis on détaille les étapes. Elyas la produit lui-même ; le
 * `SimulatedDemo` de la branche V2 ne doit PAS être réintégré.
 */
export default function Home() {
  return (
    <>
      <AuthErrorRedirect />
      <ShaderBackground />
      <Navbar />
      <main style={{ position: "relative", zIndex: 1 }}>
        {/* Premier écran : le hero et la bande de garanties occupent ensemble
            exactement une hauteur d'écran, de sorte que la ligne de
            flottaison tombe SOUS la TrustBar quelle que soit la taille du
            viewport. Le hero absorbe la place restante (cf. `.nw-fold` dans
            globals.css) — le calcul est exact par construction, sans mesure
            en JavaScript. */}
        <div className="nw-fold">
          <Hero />
          <TrustBar />
        </div>
        <NoraIntro />
        <HowItWorks />
        <WhyNawa />
        <PricingTeaser />
        <Founders />
        <FinalCTA />
      </main>
      <Footer />
    </>
  )
}
