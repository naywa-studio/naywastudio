import type { Metadata } from "next"
import Link from "next/link"
import { Navbar } from "@/components/layout/Navbar"
import { Footer } from "@/components/layout/Footer"
import { ShaderBackground } from "@/components/ui/ShaderBackground"

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Questions fréquentes sur Naywa Studio et Package Sourcing. Vivier de CVs, matching, pricing Syntec, anonymisation, pipeline candidat. Pour ESN, cabinets de consulting et cabinets de recrutement.",
}

const CATEGORIES = [
  {
    title: "Le service",
    questions: [
      {
        q: "Qu'est-ce que Naywa Studio ?",
        a: "Naywa Studio est un studio produit qui conçoit des packages d'optimisation de process métier. Notre premier package, Package Sourcing, est dédié aux ESN, cabinets de consulting et cabinets de recrutement. Nora, l'assistante du package, range votre vivier, score vos candidats sur vos missions, calcule la marge selon Syntec et suit le pipeline candidat. Vous gardez la main sur chaque décision.",
      },
      {
        q: "À qui s'adresse Package Sourcing ?",
        a: "Aux ESN, cabinets de consulting et cabinets de recrutement de toute taille, des indépendants aux équipes de 15-20 personnes. Si vous gérez quelques dizaines à quelques milliers de CVs et que vos process actuels passent par Excel + Drive, Naywa vous fait gagner des heures sur le traitement et le chiffrage.",
      },
      {
        q: "En quoi est-ce différent d'un ATS classique ?",
        a: "Un ATS gère des candidatures entrantes. Naywa gère votre vivier proactif : les CVs que vous collectez vous-même via LinkedIn, jobboards et réseau. Et surtout, Naywa intègre nativement le pricing selon la convention Syntec (calcul de marge, charges patronales, plafonds URSSAF, calendrier fériés). Ce qu'aucun ATS ne propose.",
      },
    ],
  },
  {
    title: "Vivier & parsing",
    questions: [
      {
        q: "Quels formats de CV sont supportés ?",
        a: "PDF natif (export Word, LinkedIn, Canva...) pendant la beta. L'OCR pour les CVs scannés ou photographiés arrive juste après. DOCX et autres formats seront ajoutés en fonction de la demande.",
      },
      {
        q: "Combien de CVs je peux uploader ?",
        a: "Pendant la beta : 50 uploads par jour et par compte, sans limite mensuelle. C'est largement suffisant pour absorber une journée complète de sourcing intensif.",
      },
      {
        q: "Quelles informations Nora extrait ?",
        a: "Nom complet, email, téléphone, localisation, LinkedIn, poste actuel, entreprise, années d'expérience, séniorité, compétences techniques, langues, expériences détaillées, formations et certifications.",
      },
      {
        q: "Que se passe-t-il en cas de doublon ?",
        a: "Nora détecte automatiquement les doublons par email ou téléphone et tague le CV. Vous gardez les deux versions et choisissez laquelle prime. Pas de suppression silencieuse.",
      },
    ],
  },
  {
    title: "Matching & pipeline",
    questions: [
      {
        q: "Comment fonctionne le matching ?",
        a: "Vous décrivez vos missions (titre, séniorité, compétences clés, lieu), soit en collant un brief texte que Nora analyse automatiquement, soit en remplissant le formulaire. Nora score chaque CV du vivier contre chaque mission et justifie son score sur plusieurs dimensions. Vous voyez immédiatement vos meilleurs candidats par mission, triés et expliqués.",
      },
      {
        q: "L'anonymisation, ça marche comment ?",
        a: "1 clic sur un candidat → Nora génère un PDF anonymisé : nom remplacé, photo retirée, coordonnées masquées, écoles précises rendues génériques. Prêt à transmettre à votre client pour une décision sans biais. Le CV original reste intact dans votre vivier.",
      },
      {
        q: "Et le pipeline candidat ?",
        a: "Pour chaque candidat × poste, vous suivez les étapes : Identifié → Contacté → Réponse → Entretien → Offre. Nora suggérera les relances au bon moment. L'intégration boîte mail (BCC puis OAuth Gmail/Outlook) suivra pour logger les réponses automatiquement.",
      },
    ],
  },
  {
    title: "Sécurité & données",
    questions: [
      {
        q: "Mes CVs et données sont-ils confidentiels ?",
        a: "Oui. Vos données restent dans votre espace, isolées par RLS Supabase. Aucune revente, aucun partage hors providers techniques nécessaires (Supabase pour la base et le stockage, OpenRouter pour le LLM). Pas d'entraînement de modèle sur vos CVs.",
      },
      {
        q: "Puis-je exporter ou supprimer mon vivier ?",
        a: "Oui à tout moment. Suppression d'un CV : 1 clic (fichier + ligne DB). Export complet sur demande pendant la beta, fonctionnalité self-service prévue avant la sortie.",
      },
    ],
  },
  {
    title: "Pricing Syntec",
    questions: [
      {
        q: "Qu'est-ce que le pricing Syntec dans Naywa ?",
        a: "Une fois qu'un candidat est positionné sur une mission, vous devez chiffrer pour le client. Naywa calcule en temps réel la marge mensuelle réelle selon la convention Syntec : charges patronales par statut (38%, 42%, 44% ou 22% selon position et coefficient), plafonds URSSAF, calendrier fériés français, indemnité de congés payés, période d'essai. Vous réglez le TJM facturable et le brut consultant, le reste se calcule.",
      },
      {
        q: "À quoi sert le chart 'risque de rupture' ?",
        a: "La période d'essai est un risque financier pour vous : si le consultant rompt pendant la période, vous perdez. Naywa visualise mois par mois où sont les zones de risque selon le type de contrat (CDI ou CDD avec L1243-4), la position et le coefficient. Vous voyez immédiatement si la marge cumulée sur la période d'essai justifie d'accepter la mission.",
      },
      {
        q: "Mon cabinet a des standards pricing différents, c'est paramétrable ?",
        a: "Oui. Dans /organisation/parametrage, vous définissez vos seuils de marge (min/cible), vos avantages standards (mutuelle, tickets resto, indemnités), vos jours RTT/an. Tout chiffrage à venir hérite de ces valeurs et reste éditable mission par mission, candidat par candidat.",
      },
      {
        q: "Le PDF de chiffrage est exportable ?",
        a: "Oui, en 1 clic. Version nominative (avec le nom du candidat) ou anonymisée (référence interne C-XXXXXXXX). Brandé à votre cabinet, prêt à envoyer au client.",
      },
    ],
  },
  {
    title: "Tarification",
    questions: [
      {
        q: "Combien ça coûte ?",
        a: "15 jours d'essai offerts, sans engagement. Vous fournissez votre moyen de paiement (CB ou SEPA) à l'activation, mais rien n'est prélevé pendant les 15 jours. La grille tarifaire publique sera communiquée à l'ouverture officielle de la beta. Vous pouvez annuler à tout moment depuis votre console.",
      },
      {
        q: "Comment rejoindre la beta ?",
        a: "Créez un compte (email ou Google). L'accès est immédiat. 15 jours d'essai s'activent en 1 clic depuis votre console organisation. Si vous avez un retour ou un besoin spécifique, écrivez-nous à contact@naywastudio.com, nous itérons vite.",
      },
    ],
  },
] as const

export default function FAQPage() {
  return (
    <div style={{ background: "transparent", minHeight: "100vh", display: "flex", flexDirection: "column", position: "relative" }}>
      <ShaderBackground />
      <Navbar />

      <main style={{ flex: 1, padding: "120px 24px 80px", position: "relative", zIndex: 2 }}>
        <div style={{ maxWidth: 880, margin: "0 auto" }}>
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
            Questions fréquentes
          </span>

          <h1 style={{
            fontSize: "clamp(32px, 5vw, 52px)", fontWeight: 800, color: "#111827",
            letterSpacing: "-0.03em", lineHeight: 1.08,
            margin: "0 0 18px",
            maxWidth: "22ch",
            fontFamily: "var(--font-inter), sans-serif",
          }}>
            Tout ce qu&apos;il faut savoir sur Nora.
          </h1>
          <p style={{
            fontSize: "clamp(15px, 1.1vw, 17px)", color: "#4B5563", lineHeight: 1.7,
            margin: "0 0 56px", maxWidth: "60ch",
            fontFamily: "var(--font-inter), sans-serif",
          }}>
            Si une question manque,{" "}
            <a href="mailto:contact@naywastudio.com" style={{ color: "#7C63C8", fontWeight: 600 }}>
              écrivez-nous
            </a>{" "}: on ajoute la réponse ici.
          </p>

          {CATEGORIES.map((cat) => (
            <section key={cat.title} style={{ marginBottom: 44 }}>
              <h2 style={{
                margin: "0 0 18px",
                fontSize: "clamp(20px, 2.2vw, 26px)",
                fontWeight: 800, color: "#111827",
                letterSpacing: "-0.02em",
                fontFamily: "var(--font-inter), sans-serif",
              }}>
                {cat.title}
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {cat.questions.map((q) => (
                  <details key={q.q} style={{
                    background: "white", borderRadius: 14,
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
                      {q.q}
                    </summary>
                    <p style={{
                      margin: "10px 0 0 22px",
                      fontSize: 14, color: "#4B5563", lineHeight: 1.7,
                    }}>
                      {q.a}
                    </p>
                  </details>
                ))}
              </div>
            </section>
          ))}

          <div style={{
            marginTop: 30, paddingTop: 26,
            borderTop: "1px solid #F0ECF8",
            display: "flex", flexWrap: "wrap", gap: 14,
            fontFamily: "var(--font-inter), sans-serif",
          }}>
            <Link href="/solutions" style={{ color: "#7C63C8", fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
              Découvrir nos solutions →
            </Link>
            <Link href="/tarifs" style={{ color: "#7C63C8", fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
              Voir les tarifs →
            </Link>
            <Link href="/login?mode=signup" style={{ color: "#7C63C8", fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
              Rejoindre la beta →
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
