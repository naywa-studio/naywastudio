import type { Metadata } from 'next'
import Link from 'next/link'
import { Logo } from '@/components/ui/Logo'

export const metadata: Metadata = {
  title: 'FAQ',
  description: 'Questions fréquentes sur Nawa Studio — agents IA, sourcing, abonnements, workspace.',
}

const CATEGORIES = [
  {
    title: 'Le service',
    questions: [
      {
        q: "Qu'est-ce que Nawa Studio exactement ?",
        a: "Nawa Studio est un studio d'agents IA spécialisés dans le sourcing et recrutement. Nous déployons pour vous un agent IA dédié, opérationnel en 48h, qui automatise tout ou partie de votre processus de sourcing de candidats.",
      },
      {
        q: "À qui s'adresse Nawa Studio ?",
        a: "Nous ciblons les cabinets de recrutement, les freelances en recrutement et les petites agences qui veulent automatiser leur sourcing sans investir dans une infrastructure technique complexe.",
      },
      {
        q: "En quoi est-ce différent d'un ChatGPT ou d'un outil IA classique ?",
        a: "Contrairement à un outil généraliste, votre agent Nawa est configuré spécifiquement pour le sourcing de candidats, hébergé sur un VPS dédié qui vous appartient, et intégré dans un workspace structuré autour de vos missions. Vous ne gérez pas de prompts — l'agent fait le travail.",
      },
    ],
  },
  {
    title: 'Les agents',
    questions: [
      {
        q: 'Quelle est la différence entre Léo, Nora et Alex ?',
        a: "Les trois agents correspondent à trois niveaux d'autonomie. Léo (N1) trie et qualifie une liste que vous lui fournissez. Nora (N2) prend en charge le sourcing de A à Z — analyse du besoin, scoring, shortlist. Alex (N3) pilote l'intégralité du recrutement : rédaction d'offres, sourcing actif, contact candidats, booking d'entretiens, transcriptions et dossiers complets.",
      },
      {
        q: "Puis-je changer d'agent après avoir souscrit ?",
        a: "Oui, l'upgrade (ou downgrade) est instantané et sans interruption de service. Vos missions en cours sont conservées. Le changement s'applique immédiatement.",
      },
      {
        q: 'Y a-t-il des sous-agents en coulisse ?',
        a: "Oui. Pour les niveaux N2 et N3, l'agent que vous voyez dans votre workspace orchestre en interne plusieurs sous-agents spécialisés. Vous n'interagissez qu'avec un seul agent — la complexité est gérée côté Nawa.",
      },
    ],
  },
  {
    title: 'Le workspace & les missions',
    questions: [
      {
        q: "Qu'est-ce qu'une mission ?",
        a: "Une mission est l'unité de travail dans votre workspace. Elle correspond à un recrutement : vous décrivez votre besoin via le chat, et votre agent produit des livrables (tableur trié, shortlist, dossiers candidats…) accessibles dans les sections de la mission.",
      },
      {
        q: 'Combien de missions puis-je créer ?',
        a: "Il n'y a pas de limite au nombre de missions. Vous pouvez gérer plusieurs recrutements en parallèle depuis votre workspace.",
      },
      {
        q: 'Puis-je exporter les livrables ?',
        a: "Oui, les sections marquées comme exportables (tableurs, shortlists, dossiers candidats) peuvent être téléchargées directement depuis le workspace. Cette fonctionnalité est en cours d'activation.",
      },
    ],
  },
  {
    title: 'Abonnement & facturation',
    questions: [
      {
        q: "Qu'est-ce qui est inclus dans l'abonnement ?",
        a: "Chaque abonnement inclut : un VPS dédié pour votre agent (hébergé sur Hostinger), une clé API IA (via OpenRouter), l'accès au workspace client et les tokens IA jusqu'à un seuil mensuel. Aucun frais de setup.",
      },
      {
        q: 'Comment fonctionne la facturation ?',
        a: "L'abonnement est mensuel, à date fixe. Pas d'engagement sur la durée. Résiliation possible à tout moment — votre accès reste actif jusqu'à la fin de la période en cours.",
      },
      {
        q: "Le service est-il gratuit pour l'instant ?",
        a: "Oui, nous sommes en phase de lancement avec un accès gratuit limité. Le paiement sera activé prochainement. Vous serez notifié avant tout changement.",
      },
    ],
  },
  {
    title: 'Données & sécurité',
    questions: [
      {
        q: 'Où sont hébergées mes données ?',
        a: "Votre agent tourne sur un VPS dédié chez Hostinger (EU). Vos données ne sont jamais partagées avec d'autres clients — isolation totale par architecture.",
      },
      {
        q: 'Qui a accès à mes données candidats ?',
        a: "Personne chez Nawa n'accède à vos données candidats en conditions normales. Votre VPS est isolé et la clé API qui s'y trouve vous appartient.",
      },
      {
        q: 'Comment supprimer mon compte et mes données ?',
        a: "Contactez-nous à contact@nawastudio.com. Nous procédons à la suppression complète (compte, VPS, données) dans un délai de 30 jours.",
      },
    ],
  },
]

export default function FAQPage() {
  return (
    <div style={{ background: '#FAFAFA', minHeight: '100vh' }}>
      {/* Header */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 40,
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid #F0ECF8',
          padding: '0 24px',
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Link href="/" style={{ textDecoration: 'none' }}>
          <Logo size="md" />
        </Link>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Link
            href="/tarifs"
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: '#6B7280',
              textDecoration: 'none',
              padding: '8px 16px',
              fontFamily: 'var(--font-inter), sans-serif',
            }}
          >
            Tarifs
          </Link>
          <Link
            href="/espace-client"
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: '#7C63C8',
              textDecoration: 'none',
              padding: '8px 16px',
              borderRadius: 8,
              border: '1.5px solid #E2DAF6',
              fontFamily: 'var(--font-inter), sans-serif',
            }}
          >
            Mon espace
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section style={{ padding: '72px 24px 48px', textAlign: 'center', maxWidth: 640, margin: '0 auto' }}>
        <span
          style={{
            display: 'inline-block',
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            color: '#7C63C8',
            background: '#F0ECF8',
            padding: '6px 16px',
            borderRadius: 100,
            marginBottom: 24,
            fontFamily: 'var(--font-inter), sans-serif',
          }}
        >
          FAQ
        </span>
        <h1
          style={{
            fontSize: 'clamp(28px, 5vw, 44px)',
            fontWeight: 800,
            color: '#111827',
            lineHeight: 1.15,
            margin: '0 0 16px',
            letterSpacing: -0.5,
            fontFamily: 'var(--font-space-grotesk), sans-serif',
          }}
        >
          Questions fréquentes
        </h1>
        <p
          style={{
            fontSize: 16,
            color: '#6B7280',
            lineHeight: 1.65,
            margin: 0,
            fontFamily: 'var(--font-inter), sans-serif',
          }}
        >
          Tout ce que vous devez savoir sur Nawa Studio, nos agents et notre service.
        </p>
      </section>

      {/* FAQ content */}
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '0 24px 80px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 48 }}>
          {CATEGORIES.map((cat) => (
            <section key={cat.title}>
              {/* Category title */}
              <h2
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                  color: '#7C63C8',
                  margin: '0 0 20px',
                  fontFamily: 'var(--font-inter), sans-serif',
                }}
              >
                {cat.title}
              </h2>

              {/* Questions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {cat.questions.map((item) => (
                  <details
                    key={item.q}
                    style={{
                      background: 'white',
                      borderRadius: 12,
                      border: '1px solid #F0ECF8',
                      overflow: 'hidden',
                    }}
                  >
                    <summary
                      style={{
                        padding: '18px 20px',
                        fontSize: 15,
                        fontWeight: 600,
                        color: '#111827',
                        cursor: 'pointer',
                        listStyle: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        fontFamily: 'var(--font-inter), sans-serif',
                        userSelect: 'none',
                      }}
                    >
                      {item.q}
                      <span
                        aria-hidden
                        style={{
                          flexShrink: 0,
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          background: '#F0ECF8',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 14,
                          color: '#7C63C8',
                          fontWeight: 400,
                        }}
                      >
                        +
                      </span>
                    </summary>
                    <div
                      style={{
                        padding: '0 20px 18px',
                        borderTop: '1px solid #F8F6FF',
                      }}
                    >
                      <p
                        style={{
                          margin: '14px 0 0',
                          fontSize: 14,
                          color: '#4B5563',
                          lineHeight: 1.7,
                          fontFamily: 'var(--font-inter), sans-serif',
                        }}
                      >
                        {item.a}
                      </p>
                    </div>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Still a question? */}
        <div
          style={{
            marginTop: 56,
            background: 'linear-gradient(135deg, #7C63C8 0%, #9B8DD4 100%)',
            borderRadius: 20,
            padding: '40px 32px',
            textAlign: 'center',
          }}
        >
          <p
            style={{
              margin: '0 0 8px',
              fontSize: 20,
              fontWeight: 700,
              color: 'white',
              fontFamily: 'var(--font-space-grotesk), sans-serif',
            }}
          >
            Vous n'avez pas trouvé votre réponse ?
          </p>
          <p
            style={{
              margin: '0 0 24px',
              fontSize: 14,
              color: 'rgba(255,255,255,0.8)',
              fontFamily: 'var(--font-inter), sans-serif',
            }}
          >
            Notre équipe répond sous 24h ouvrées.
          </p>
          <a
            href="mailto:contact@nawastudio.com"
            style={{
              display: 'inline-block',
              background: 'white',
              color: '#7C63C8',
              padding: '13px 28px',
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 700,
              textDecoration: 'none',
              fontFamily: 'var(--font-inter), sans-serif',
            }}
          >
            Nous écrire →
          </a>
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          padding: '24px',
          borderTop: '1px solid #F0ECF8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <Logo size="sm" />
        <span style={{ fontSize: 12, color: '#9CA3AF', fontFamily: 'var(--font-inter), sans-serif' }}>
          © 2026 Nawa Studio
        </span>
        <Link
          href="/tarifs"
          style={{ fontSize: 12, color: '#9CA3AF', textDecoration: 'none', fontFamily: 'var(--font-inter), sans-serif' }}
        >
          Tarifs
        </Link>
        <Link
          href="/mentions-legales"
          style={{ fontSize: 12, color: '#9CA3AF', textDecoration: 'none', fontFamily: 'var(--font-inter), sans-serif' }}
        >
          Mentions légales
        </Link>
        <a
          href="mailto:contact@nawastudio.com"
          style={{ fontSize: 12, color: '#9CA3AF', textDecoration: 'none', fontFamily: 'var(--font-inter), sans-serif' }}
        >
          contact@nawastudio.com
        </a>
      </footer>
    </div>
  )
}
