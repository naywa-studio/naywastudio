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
        a: "Naywa Studio conçoit des packages d'optimisation de process métier augmentés par l'intelligence artificielle. Notre premier package, Package Sourcing, est dédié aux ESN, cabinets de consulting et cabinets de recrutement. Nora, l'assistante du package, range votre vivier, score vos candidats sur vos missions, calcule la marge selon la convention Syntec et suit le pipeline candidat. Vous gardez la main sur chaque décision : Nora propose, vous tranchez.",
      },
      {
        q: "À qui s'adresse Package Sourcing ?",
        a: "Aux ESN, cabinets de consulting et cabinets de recrutement de toute taille, des indépendants aux équipes d'une vingtaine de personnes. Si votre structure gère plusieurs dizaines à plusieurs milliers de CVs avec des process qui passent par Excel et Drive, Naywa vous fait gagner des heures sur le traitement et le chiffrage.",
      },
      {
        q: "En quoi est-ce différent d'un ATS classique ?",
        a: "Un ATS gère des candidatures entrantes. Naywa gère votre vivier proactif : les CVs que vous collectez vous-même via LinkedIn, jobboards et réseau. Et surtout, Naywa intègre nativement le pricing selon la convention Syntec (calcul de marge, charges patronales, plafonds URSSAF, calendrier fériés, risque de rupture employeur). Ce qu'aucun ATS ne propose.",
      },
      {
        q: "Vos données nourrissent-elles vos modèles ?",
        a: "Non. Aucune donnée client n'est utilisée pour entraîner ou affiner un modèle. Les modèles utilisés sont opérés par notre prestataire IA, sans rétention ni apprentissage sur les contenus que vous nous confiez.",
      },
    ],
  },
  {
    title: "Vivier et parsing",
    questions: [
      {
        q: "Quels formats de CV sont supportés ?",
        a: "PDF natif (export Word, LinkedIn, Canva, etc.) et CVs scannés ou photographiés grâce à l'OCR intégré. DOCX et autres formats seront ajoutés selon la demande.",
      },
      {
        q: "Combien de CVs peut-on uploader ?",
        a: "Aucune limite imposée au quotidien. L'usage est dimensionné pour absorber des journées complètes de sourcing intensif. Un palier global est appliqué uniquement pour éviter les abus (scripts, automatisations massives). Si vous le rencontrez en usage normal, contactez-nous : nous relevons le palier au cas par cas.",
      },
      {
        q: "Quelles informations Nora extrait-elle ?",
        a: "Nom complet, email, téléphone, localisation, LinkedIn, poste actuel, entreprise, années d'expérience post-diplôme, séniorité, compétences techniques, langues, expériences détaillées, formations et certifications. L'alternance en cours et les stages avant diplôme sont identifiés comme tels et n'inflent pas la séniorité.",
      },
      {
        q: "Que se passe-t-il en cas de doublon ?",
        a: "Nora détecte automatiquement les doublons par email ou téléphone et tague le CV concerné. Vous gardez les deux versions et choisissez laquelle prime. Pas de suppression silencieuse.",
      },
      {
        q: "Comment mon vivier est-il organisé ?",
        a: "Nora classe vos candidats par secteur (Commercial, IT / Data, Ingénierie, Finance…) au fur et à mesure des uploads. Vous pouvez créer vos propres secteurs, les renommer, et reclasser un candidat en un geste — un profil hybride peut appartenir à plusieurs secteurs. C'est ce qui rend le vivier exploitable sur la durée, et pas juste un dépôt de fichiers.",
      },
    ],
  },
  {
    title: "Matching et pipeline",
    questions: [
      {
        q: "Comment fonctionne le matching ?",
        a: "Vous décrivez vos missions (titre, séniorité, compétences clés, lieu), soit en collant un brief texte que Nora analyse automatiquement, soit en remplissant le formulaire. Nora score chaque CV du vivier contre chaque mission et justifie son score sur plusieurs dimensions. Vous voyez immédiatement vos meilleurs candidats par mission, triés et expliqués.",
      },
      {
        q: "Comment fonctionne l'anonymisation ?",
        a: "Un clic sur un candidat suffit : Nora génère un PDF anonymisé. Nom remplacé, photo retirée, coordonnées masquées, écoles précises rendues génériques. Prêt à transmettre à votre client pour une décision sans biais. Le CV original reste intact dans votre vivier.",
      },
      {
        q: "Et le pipeline candidat ?",
        a: "Pour chaque candidat sur chaque mission, vous suivez les étapes : Identifié, Contacté, Réponse, Entretien, Offre. Le pipeline est partagé entre les membres de votre structure pour que tout le monde voit où en est chaque positionnement.",
      },
    ],
  },
  {
    title: "Pricing Syntec",
    questions: [
      {
        q: "Qu'est-ce que le pricing Syntec dans Naywa ?",
        a: "Une fois qu'un candidat est positionné sur une mission, vous devez chiffrer pour le client. Naywa calcule en temps réel la marge mensuelle réelle selon la convention Syntec : charges patronales par statut (entre 38 et 44 % selon position et coefficient, ou 22 % en cas d'expatriation), plafonds URSSAF, calendrier fériés français, indemnité de congés payés et de RTT, période d'essai. Vous réglez le TJM facturable et le brut consultant, le reste se calcule.",
      },
      {
        q: "À quoi sert le chart « risque de rupture » ?",
        a: "La période d'essai est un risque financier pour la structure employeur : si le consultant rompt ou est licencié pendant la période, le coût engagé peut dépasser la marge cumulée. Naywa visualise mois par mois la marge restante en cas de rupture conventionnelle (scénario principal) et de licenciement (borne pire-cas), avec la décomposition indemnité spécifique plus congés payés non pris. Vous voyez immédiatement si la mission justifie le risque.",
      },
      {
        q: "Notre structure a des standards pricing différents, est-ce paramétrable ?",
        a: "Oui. Dans la console organisation, vous définissez vos seuils de marge (minimum et cible), vos avantages standards (mutuelle, tickets restaurant, indemnités URSSAF), vos jours RTT par an, la médecine du travail. Tout chiffrage à venir hérite de ces valeurs, et reste éditable mission par mission et candidat par candidat.",
      },
      {
        q: "Le PDF de chiffrage est-il exportable ?",
        a: "Oui, en un clic. Version nominative (avec le nom du candidat) ou anonymisée (référence interne du type C-XXXXXXXX). Brandé à votre structure, prêt à envoyer au client.",
      },
    ],
  },
  {
    title: "Sécurité et données",
    questions: [
      {
        q: "Nos CVs et données sont-ils confidentiels ?",
        a: "Oui. Vos données restent dans votre espace, isolées au niveau de la base de données par Row Level Security. Aucune revente, aucun partage en dehors des prestataires techniques nécessaires au fonctionnement (hébergement, IA, envoi d'email). Aucune utilisation pour entraîner un modèle.",
      },
      {
        q: "Pouvons-nous exporter ou supprimer notre vivier ?",
        a: "Oui à tout moment. Suppression d'un CV en un clic (fichier et ligne en base). Export complet sur demande, fonctionnalité self-service en cours d'arbitrage produit.",
      },
      {
        q: "Que se passe-t-il en cas de suppression de notre structure ?",
        a: "Si vous êtes seul propriétaire, la suppression est immédiate. S'il reste des membres dans la structure, une période de grâce de 30 jours s'ouvre, pendant laquelle vous pouvez revenir sur la décision. Passé ce délai, toutes les données associées sont supprimées de manière définitive.",
      },
    ],
  },
  {
    title: "Tarification",
    questions: [
      {
        q: "Comment se passe la période d'essai ?",
        a: "Quinze jours offerts, sans engagement, sans carte bancaire demandée à l'inscription. Vous activez l'essai en un clic depuis votre console organisation. À la fin des 15 jours, vous choisissez votre formule pour activer l'abonnement, sinon votre accès s'arrête sans prélèvement.",
      },
      {
        q: "Comment fonctionne la tarification ?",
        a: "Par personne, avec un tarif dégressif : plus vous êtes nombreux, moins la personne coûte. La Suite Pricing Syntec est une option à part, à prix unique quel que soit l'effectif. Facturation mensuelle via Stripe, sans engagement de durée. La grille complète est sur la page Tarifs.",
      },
      {
        q: "Comment créer un compte ?",
        a: "Depuis la page d'inscription, par email ou compte Google. La structure est créée automatiquement, vous êtes propriétaire, vous pouvez inviter vos collègues comme membres et activer votre essai dans la foulée.",
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
              Démarrer votre essai →
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
