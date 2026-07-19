"use client"

import Link from "next/link"
import { useLanguage } from "@/lib/i18n/LanguageContext"

const CATEGORIES = {
  fr: [
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
      title: "Vivier et lecture des CV",
      questions: [
        {
          q: "Quels formats de CV sont supportés ?",
          a: "Le PDF, qu'il vienne de Word, LinkedIn, Canva ou d'un scan — Nora lit aussi les CV scannés ou photographiés. Le format Word et les autres seront ajoutés selon la demande.",
        },
        {
          q: "Combien de CV peut-on déposer ?",
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
          a: "Oui. Vos données restent dans votre espace, cloisonné au niveau de la base de données. Aucune revente, aucun partage en dehors des prestataires techniques nécessaires au fonctionnement (hébergement, IA, envoi d'email). Aucune utilisation pour entraîner un modèle.",
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
  ],
  en: [
    {
      title: "The service",
      questions: [
        {
          q: "What is Naywa Studio?",
          a: "Naywa Studio designs AI-powered business process optimization packages. Our first package, Package Sourcing, is built for IT consulting firms, consulting firms, and recruitment agencies. Nora, the package's assistant, organizes your talent pool, scores your candidates against your job openings, calculates margin using industry consulting rules, and tracks the candidate pipeline. You stay in control of every decision: Nora suggests, you decide.",
        },
        {
          q: "Who is Package Sourcing for?",
          a: "IT consulting firms, consulting firms, and recruitment agencies of any size, from solo recruiters to teams of about twenty people. If your team manages anywhere from a few dozen to several thousand CVs through Excel and Drive-based processes, Naywa saves you hours on processing and pricing.",
        },
        {
          q: "How is this different from a standard ATS?",
          a: "An ATS manages inbound applications. Naywa manages your proactive talent pool: the CVs you collect yourself through LinkedIn, job boards, and your network. And crucially, Naywa natively includes consulting-rate pricing (margin calculation, employer payroll taxes, social security caps, holiday calendar, termination risk). Something no ATS offers.",
        },
        {
          q: "Does your data train your models?",
          a: "No. No client data is ever used to train or fine-tune a model. The models we use are operated by our AI provider, with no retention or learning on the content you share with us.",
        },
      ],
    },
    {
      title: "Talent pool & CV reading",
      questions: [
        {
          q: "What CV formats are supported?",
          a: "PDF, whether it comes from Word, LinkedIn, Canva or a scanner — Nora also reads scanned or photographed CVs. Word and other formats will be added based on demand.",
        },
        {
          q: "How many CVs can I add?",
          a: "No day-to-day limit. Usage is sized to handle full days of intensive sourcing. An overall ceiling only kicks in to prevent abuse (scripts, mass automation). If you hit it during normal use, contact us — we raise the ceiling on a case-by-case basis.",
        },
        {
          q: "What information does Nora extract?",
          a: "Full name, email, phone, location, LinkedIn, current role, company, years of post-graduation experience, seniority, technical skills, languages, detailed work history, education, and certifications. Ongoing apprenticeships and pre-graduation internships are flagged as such and don't inflate seniority.",
        },
        {
          q: "What happens with duplicates?",
          a: "Nora automatically detects duplicates by email or phone number and tags the CV in question. You keep both versions and choose which one takes priority. Nothing is ever silently deleted.",
        },
        {
          q: "How is my talent pool organized?",
          a: "Nora sorts your candidates by sector (Sales, IT/Data, Engineering, Finance…) as you add them. You can create your own sectors, rename them, and reclassify a candidate in one click — a hybrid profile can belong to several sectors. That's what keeps the talent pool usable over time, rather than just a pile of files.",
        },
      ],
    },
    {
      title: "Matching & pipeline",
      questions: [
        {
          q: "How does matching work?",
          a: "You describe your job openings (title, seniority, key skills, location), either by pasting a text brief that Nora automatically analyzes, or by filling out the form. Nora scores every CV in the talent pool against every job opening and justifies the score across several dimensions. You immediately see your best candidates per opening, sorted and explained.",
        },
        {
          q: "How does anonymization work?",
          a: "One click on a candidate is enough: Nora generates an anonymized PDF. Name replaced, photo removed, contact details hidden, specific schools made generic. Ready to send to your client for an unbiased decision. The original CV stays untouched in your talent pool.",
        },
        {
          q: "What about the candidate pipeline?",
          a: "For every candidate on every job opening, you track the stages: Identified, Contacted, Replied, Interview, Offer. The pipeline is shared across your team so everyone can see where each candidate stands.",
        },
      ],
    },
    {
      title: "Consulting-rate pricing",
      questions: [
        {
          q: "What is consulting-rate pricing in Naywa?",
          a: "Once a candidate is placed on a job opening, you need to price it for the client. Naywa calculates the real monthly margin in real time using industry consulting rules: employer payroll taxes by status (between 38% and 44% depending on role and grade, or 22% for expatriates), social security caps, the French holiday calendar, paid leave and time-off allowance, and the probationary period. You set the billable daily rate and the consultant's gross salary — the rest is calculated for you.",
        },
        {
          q: 'What is the "termination risk" chart for?',
          a: 'The probationary period is a financial risk for the employer: if the consultant leaves or is let go during that period, the cost incurred can exceed the margin earned so far. Naywa visualizes, month by month, the remaining margin under a mutually agreed termination (main scenario) and a dismissal (worst case), broken down by severance pay plus unused paid leave. You immediately see whether the opening is worth the risk.',
        },
        {
          q: "Our team has different pricing standards — is it configurable?",
          a: "Yes. In the organization console, you set your margin thresholds (minimum and target), your standard benefits (health insurance, meal vouchers, social security allowances), your annual paid time-off days, and occupational health coverage. Every future quote inherits these values and stays editable per job opening and per candidate.",
        },
        {
          q: "Can the pricing PDF be exported?",
          a: "Yes, in one click. Named version (with the candidate's name) or anonymized (an internal reference like C-XXXXXXXX). Branded to your organization, ready to send to the client.",
        },
      ],
    },
    {
      title: "Security & data",
      questions: [
        {
          q: "Are our CVs and data confidential?",
          a: "Yes. Your data stays within your own space, walled off at the database level. No reselling, no sharing outside the technical providers required to run the service (hosting, AI, email delivery). Never used to train a model.",
        },
        {
          q: "Can we export or delete our talent pool?",
          a: "Yes, at any time. Delete a single CV in one click (file and database row). Full export on request — a self-service version of this feature is currently being evaluated.",
        },
        {
          q: "What happens if we delete our organization?",
          a: "If you're the sole owner, deletion is immediate. If other members remain in the organization, a 30-day grace period opens, during which you can reverse the decision. After that period, all associated data is permanently deleted.",
        },
      ],
    },
    {
      title: "Pricing",
      questions: [
        {
          q: "How does the trial period work?",
          a: "Fifteen days free, no commitment, no credit card required at signup. You activate the trial in one click from your organization console. At the end of the 15 days, you choose a plan to activate your subscription — otherwise your access simply ends, with no charge.",
        },
        {
          q: "How does pricing work?",
          a: "Per person, with a volume discount: the more people you have, the less each one costs. Suite Pricing Syntec is a separate option, at a flat price regardless of headcount. Monthly billing via Stripe, no fixed-term commitment. The full pricing grid is on the Pricing page.",
        },
        {
          q: "How do I create an account?",
          a: "From the sign-up page, using email or a Google account. Your organization is created automatically, you become the owner, and you can invite colleagues as members and activate your trial right away.",
        },
      ],
    },
  ],
}

const copy = {
  fr: {
    badge: "Questions fréquentes",
    title: "Tout ce qu'il faut savoir sur Nora.",
    introPre: "Si une question manque, ",
    introLink: "écrivez-nous",
    introPost: " : on ajoute la réponse ici.",
    linkSolutions: "Découvrir nos solutions →",
    linkPricing: "Voir les tarifs →",
    linkTrial: "Démarrer votre essai →",
  },
  en: {
    badge: "Frequently asked questions",
    title: "Everything you need to know about Nora.",
    introPre: "If a question is missing, ",
    introLink: "write to us",
    introPost: ": we'll add the answer here.",
    linkSolutions: "Discover our solutions →",
    linkPricing: "See pricing →",
    linkTrial: "Start your trial →",
  },
}

export function FaqContent() {
  const { lang } = useLanguage()
  const categories = CATEGORIES[lang]
  const t = copy[lang]

  return (
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
          {t.badge}
        </span>

        <h1 style={{
          fontSize: "clamp(32px, 5vw, 52px)", fontWeight: 800, color: "#111827",
          letterSpacing: "-0.03em", lineHeight: 1.08,
          margin: "0 0 18px",
          maxWidth: "22ch",
          fontFamily: "var(--font-fraunces), serif",
        }}>
          {t.title}
        </h1>
        <p style={{
          fontSize: "clamp(15px, 1.1vw, 17px)", color: "#4B5563", lineHeight: 1.7,
          margin: "0 0 56px", maxWidth: "60ch",
          fontFamily: "var(--font-inter), sans-serif",
        }}>
          {t.introPre}
          <a href="mailto:contact@naywastudio.com" style={{ color: "#7C63C8", fontWeight: 600 }}>
            {t.introLink}
          </a>
          {t.introPost}
        </p>

        {categories.map((cat) => (
          <section key={cat.title} style={{ marginBottom: 44 }}>
            <h2 style={{
              margin: "0 0 18px",
              fontSize: "clamp(20px, 2.2vw, 26px)",
              fontWeight: 800, color: "#111827",
              letterSpacing: "-0.02em",
              fontFamily: "var(--font-fraunces), serif",
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
            {t.linkSolutions}
          </Link>
          <Link href="/tarifs" style={{ color: "#7C63C8", fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
            {t.linkPricing}
          </Link>
          <Link href="/login?mode=signup" style={{ color: "#7C63C8", fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
            {t.linkTrial}
          </Link>
        </div>
      </div>
    </main>
  )
}
