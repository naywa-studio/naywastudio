import type { Metadata } from 'next'
import Link from 'next/link'
import { Logo } from '@/components/ui/Logo'

export const metadata: Metadata = {
  title: 'Tarifs',
  description: "Abonnements simples et transparents pour vos agents IA de sourcing. Choisissez le niveau d'autonomie adapté à vos besoins.",
}

const PLANS = [
  {
    level: 'N1',
    agent: 'Léo',
    role: 'Agent de tri & nettoyage',
    price: '149',
    color: '#22c55e',
    colorLight: 'rgba(34,197,94,0.07)',
    colorMid: 'rgba(34,197,94,0.14)',
    border: 'rgba(34,197,94,0.22)',
    badge: null,
    description: 'Idéal pour trier et qualifier rapidement une liste de candidats existante.',
    includes: [
      'Upload de tableur (CSV, Excel, export jobboard)',
      'Définition du profil cible en langage naturel',
      'Tableur nettoyé & profils mis en évidence',
      'Détection automatique des doublons',
      'Export du résultat',
    ],
    notIncluded: ['Sourcing actif', 'Contact candidats', 'Reporting'],
  },
  {
    level: 'N2',
    agent: 'Nora',
    role: 'Agent maître de sourcing',
    price: '299',
    color: '#3b82f6',
    colorLight: 'rgba(59,130,246,0.07)',
    colorMid: 'rgba(59,130,246,0.14)',
    border: 'rgba(59,130,246,0.22)',
    badge: 'Le plus demandé',
    description: 'Automatisation complète du sourcing de A à Z, sans complexité technique.',
    includes: [
      'Tout ce que fait Léo',
      'Analyse fine du besoin de recrutement',
      'Scoring & priorisation des candidats',
      'Shortlist priorisée avec commentaires',
      'Rapport hebdomadaire automatique',
    ],
    notIncluded: ['Prise de contact candidats', 'Gestion du calendrier'],
  },
  {
    level: 'N3',
    agent: 'Alex',
    role: 'Agent orchestrateur de recrutement',
    price: '499',
    color: '#7C63C8',
    colorLight: 'rgba(124,99,200,0.07)',
    colorMid: 'rgba(124,99,200,0.14)',
    border: 'rgba(124,99,200,0.22)',
    badge: 'Premium',
    description: "L'équivalent d'une équipe de recrutement complète, pilotée par IA.",
    includes: [
      'Tout ce que fait Nora',
      "Rédaction d'offres d'emploi",
      'Sourcing & chasse active de candidats',
      'Prise de contact & relances automatiques',
      "Booking d'entretiens",
      "Transcription d'appels & synthèse candidat",
      'Dossiers candidats complets',
      'Dashboard temps réel',
    ],
    notIncluded: [],
  },
]

const INCLUDED_ALL = [
  { icon: '🖥️', label: 'VPS dédié inclus', desc: '1 serveur isolé par client, géré par Nawa.' },
  { icon: '🔑', label: 'Clé API IA incluse', desc: "Tokens IA compris dans l'abonnement." },
  { icon: '⚡', label: 'Mise en service en 48h', desc: 'Votre agent est opérationnel sous 48h.' },
  { icon: '🔄', label: 'Upgrade instantané', desc: 'Changez de niveau à tout moment, sans interruption.' },
]

export default function TarifsPage() {
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
            href="/catalogue"
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: '#6B7280',
              textDecoration: 'none',
              padding: '8px 16px',
            }}
          >
            Catalogue
          </Link>
          <Link
            href="/workspace"
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: '#7C63C8',
              textDecoration: 'none',
              padding: '8px 16px',
              borderRadius: 8,
              border: '1.5px solid #E2DAF6',
            }}
          >
            Mon espace
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section style={{ padding: '72px 24px 40px', textAlign: 'center', maxWidth: 720, margin: '0 auto' }}>
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
          Tarifs
        </span>
        <h1
          style={{
            fontSize: 'clamp(30px, 5vw, 48px)',
            fontWeight: 800,
            color: '#111827',
            lineHeight: 1.15,
            margin: '0 0 16px',
            letterSpacing: -0.5,
            fontFamily: 'var(--font-space-grotesk), sans-serif',
          }}
        >
          Simple, transparent, sans surprise
        </h1>
        <p
          style={{
            fontSize: 'clamp(15px, 2vw, 18px)',
            color: '#6B7280',
            lineHeight: 1.65,
            margin: 0,
            fontFamily: 'var(--font-inter), sans-serif',
          }}
        >
          Un abonnement mensuel fixe par agent. VPS et tokens IA inclus.
          Changez de niveau à tout moment, sans frais.
        </p>
      </section>

      {/* Pricing cards */}
      <section style={{ padding: '16px 24px 80px', maxWidth: 1100, margin: '0 auto' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: 24,
            alignItems: 'stretch',
          }}
        >
          {PLANS.map((plan) => (
            <div
              key={plan.agent}
              style={{
                position: 'relative',
                background: 'white',
                borderRadius: 20,
                border: `1.5px solid ${plan.border}`,
                padding: '32px 28px 28px',
                display: 'flex',
                flexDirection: 'column',
                gap: 20,
              }}
            >
              {/* Badge */}
              {plan.badge && (
                <div
                  style={{
                    position: 'absolute',
                    top: -12,
                    right: 20,
                    background: plan.color,
                    color: 'white',
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '4px 14px',
                    borderRadius: 100,
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                    fontFamily: 'var(--font-inter), sans-serif',
                  }}
                >
                  {plan.badge}
                </div>
              )}

              {/* Header */}
              <div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 1.5,
                    textTransform: 'uppercase',
                    color: plan.color,
                    fontFamily: 'var(--font-inter), sans-serif',
                  }}
                >
                  {plan.level}
                </span>
                <h2
                  style={{
                    fontSize: 28,
                    fontWeight: 800,
                    color: '#111827',
                    margin: '8px 0 2px',
                    letterSpacing: -0.3,
                    fontFamily: 'var(--font-space-grotesk), sans-serif',
                  }}
                >
                  {plan.agent}
                </h2>
                <p
                  style={{
                    fontSize: 14,
                    color: '#6B7280',
                    margin: 0,
                    fontWeight: 500,
                    fontFamily: 'var(--font-inter), sans-serif',
                  }}
                >
                  {plan.role}
                </p>
              </div>

              {/* Price */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: 6,
                  padding: '16px 0',
                  borderTop: `1px solid ${plan.border}`,
                  borderBottom: `1px solid ${plan.border}`,
                }}
              >
                <span
                  style={{
                    fontSize: 44,
                    fontWeight: 800,
                    color: '#111827',
                    lineHeight: 1,
                    fontFamily: 'var(--font-space-grotesk), sans-serif',
                    letterSpacing: -1,
                  }}
                >
                  {plan.price}€
                </span>
                <span
                  style={{
                    fontSize: 14,
                    color: '#9CA3AF',
                    paddingBottom: 6,
                    fontFamily: 'var(--font-inter), sans-serif',
                  }}
                >
                  / mois
                </span>
              </div>

              {/* Description */}
              <p
                style={{
                  fontSize: 14,
                  color: '#4B5563',
                  lineHeight: 1.65,
                  margin: 0,
                  fontFamily: 'var(--font-inter), sans-serif',
                }}
              >
                {plan.description}
              </p>

              {/* Features */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, flex: 1 }}>
                {plan.includes.map((feat) => (
                  <div
                    key={feat}
                    style={{
                      display: 'flex',
                      gap: 10,
                      alignItems: 'flex-start',
                      fontSize: 13,
                      color: '#374151',
                      lineHeight: 1.5,
                      fontFamily: 'var(--font-inter), sans-serif',
                    }}
                  >
                    <span style={{ color: plan.color, fontSize: 15, lineHeight: '20px', flexShrink: 0 }}>✓</span>
                    {feat}
                  </div>
                ))}
                {plan.notIncluded.map((feat) => (
                  <div
                    key={feat}
                    style={{
                      display: 'flex',
                      gap: 10,
                      alignItems: 'flex-start',
                      fontSize: 13,
                      color: '#D1D5DB',
                      lineHeight: 1.5,
                      fontFamily: 'var(--font-inter), sans-serif',
                    }}
                  >
                    <span style={{ fontSize: 15, lineHeight: '20px', flexShrink: 0 }}>–</span>
                    {feat}
                  </div>
                ))}
              </div>

              {/* CTA */}
              <Link
                href="/catalogue"
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'center',
                  padding: '14px 24px',
                  borderRadius: 12,
                  fontWeight: 600,
                  fontSize: 15,
                  color: 'white',
                  background: plan.color,
                  textDecoration: 'none',
                  fontFamily: 'var(--font-inter), sans-serif',
                  boxSizing: 'border-box',
                }}
              >
                Choisir {plan.agent} →
              </Link>
            </div>
          ))}
        </div>

        {/* Note */}
        <p
          style={{
            textAlign: 'center',
            marginTop: 24,
            fontSize: 13,
            color: '#9CA3AF',
            fontFamily: 'var(--font-inter), sans-serif',
          }}
        >
          Pas de frais de setup. Résiliation à tout moment. Facturation mensuelle.
        </p>
      </section>

      {/* Inclus dans tous les abonnements */}
      <section
        style={{
          background: '#F8F6FF',
          borderTop: '1px solid #F0ECF8',
          borderBottom: '1px solid #F0ECF8',
          padding: '64px 24px',
        }}
      >
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <h2
            style={{
              textAlign: 'center',
              fontSize: 26,
              fontWeight: 700,
              color: '#111827',
              marginBottom: 48,
              fontFamily: 'var(--font-space-grotesk), sans-serif',
            }}
          >
            Inclus dans tous les abonnements
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 32,
            }}
          >
            {INCLUDED_ALL.map((item) => (
              <div
                key={item.label}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 32 }}>{item.icon}</span>
                <p
                  style={{
                    margin: 0,
                    fontSize: 15,
                    fontWeight: 700,
                    color: '#111827',
                    fontFamily: 'var(--font-space-grotesk), sans-serif',
                  }}
                >
                  {item.label}
                </p>
                <p
                  style={{
                    margin: 0,
                    fontSize: 13,
                    color: '#6B7280',
                    lineHeight: 1.55,
                    fontFamily: 'var(--font-inter), sans-serif',
                  }}
                >
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ shortcut */}
      <section style={{ padding: '64px 24px', textAlign: 'center', maxWidth: 560, margin: '0 auto' }}>
        <h2
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: '#111827',
            marginBottom: 10,
            fontFamily: 'var(--font-space-grotesk), sans-serif',
          }}
        >
          Une question sur les tarifs ?
        </h2>
        <p
          style={{
            fontSize: 15,
            color: '#6B7280',
            marginBottom: 24,
            fontFamily: 'var(--font-inter), sans-serif',
          }}
        >
          Consultez notre FAQ ou écrivez-nous directement.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link
            href="/faq"
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: '#7C63C8',
              textDecoration: 'none',
              padding: '12px 24px',
              borderRadius: 10,
              border: '1.5px solid #E2DAF6',
              background: 'white',
              fontFamily: 'var(--font-inter), sans-serif',
            }}
          >
            Voir la FAQ
          </Link>
          <a
            href="mailto:contact@nawastudio.com"
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: '#6B7280',
              textDecoration: 'none',
              padding: '12px 24px',
              borderRadius: 10,
              border: '1.5px solid #E5E7EB',
              background: 'white',
              fontFamily: 'var(--font-inter), sans-serif',
            }}
          >
            Nous contacter
          </a>
        </div>
      </section>

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
