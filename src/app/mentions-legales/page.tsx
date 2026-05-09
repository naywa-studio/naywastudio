import type { Metadata } from 'next'
import Link from 'next/link'
import { Logo } from '@/components/ui/Logo'

export const metadata: Metadata = {
  title: 'Mentions légales',
  description: 'Mentions légales de Naywa Studio.',
}

const SECTIONS = [
  {
    title: '1. Éditeur du site',
    content: [
      'Le site nawastudio.com est édité par :',
      '**Naywa Studio**',
      'Forme juridique : [À compléter]',
      'Capital social : [À compléter]',
      'RCS : [À compléter]',
      'SIRET : [À compléter]',
      'Siège social : Paris, France',
      'Email : contact@nawastudio.com',
    ],
  },
  {
    title: '2. Directeur de la publication',
    content: [
      'Le directeur de la publication est le représentant légal de Naywa Studio.',
    ],
  },
  {
    title: '3. Hébergement',
    content: [
      'Le site est hébergé par :',
      '**Vercel Inc.**',
      '440 N Barranca Ave #4133',
      'Covina, CA 91723, États-Unis',
      'Site : vercel.com',
    ],
  },
  {
    title: '4. Propriété intellectuelle',
    content: [
      'L\'ensemble du contenu de ce site (textes, images, graphismes, logo, icônes, vidéos, logiciels) est la propriété exclusive de Naywa Studio, sauf mention contraire.',
      'Toute reproduction, distribution, modification, adaptation, retransmission ou publication de ces éléments est strictement interdite sans l\'accord écrit de Naywa Studio.',
    ],
  },
  {
    title: '5. Données personnelles',
    content: [
      'Naywa Studio collecte des données personnelles dans le cadre de la création de compte et de l\'utilisation du service.',
      'Conformément au Règlement Général sur la Protection des Données (RGPD) et à la loi Informatique et Libertés, vous disposez des droits suivants :',
      '— Droit d\'accès à vos données',
      '— Droit de rectification',
      '— Droit à l\'effacement',
      '— Droit à la portabilité',
      '— Droit d\'opposition au traitement',
      'Pour exercer ces droits, contactez-nous à : contact@nawastudio.com',
      'Responsable du traitement : Naywa Studio — contact@nawastudio.com',
      'Les données sont conservées pour la durée de la relation contractuelle puis archivées conformément aux obligations légales.',
    ],
  },
  {
    title: '6. Cookies',
    content: [
      'Ce site utilise des cookies techniques nécessaires au bon fonctionnement du service (authentification, préférences de session).',
      'Aucun cookie de tracking publicitaire n\'est utilisé.',
      'Vous pouvez configurer votre navigateur pour refuser les cookies, ce qui peut affecter le bon fonctionnement de certaines fonctionnalités.',
    ],
  },
  {
    title: '7. Limitation de responsabilité',
    content: [
      'Naywa Studio s\'efforce d\'assurer l\'exactitude et la mise à jour des informations diffusées sur ce site, et se réserve le droit de modifier le contenu à tout moment et sans préavis.',
      'Naywa Studio ne peut être tenu responsable des dommages directs ou indirects résultant de l\'utilisation du site ou de l\'impossibilité d\'y accéder.',
    ],
  },
  {
    title: '8. Droit applicable',
    content: [
      'Les présentes mentions légales sont soumises au droit français.',
      'En cas de litige, et après tentative de résolution amiable, les tribunaux français seront seuls compétents.',
    ],
  },
]

export default function MentionsLegalesPage() {
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
        <Link
          href="/"
          style={{
            fontSize: 13,
            color: '#6B7280',
            textDecoration: 'none',
            fontFamily: 'var(--font-inter), sans-serif',
          }}
        >
          ← Retour à l'accueil
        </Link>
      </header>

      {/* Content */}
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '64px 24px 80px' }}>
        {/* Hero */}
        <div style={{ marginBottom: 56 }}>
          <span
            style={{
              display: 'inline-block',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              color: '#7C63C8',
              background: '#F0ECF8',
              padding: '5px 14px',
              borderRadius: 100,
              marginBottom: 20,
              fontFamily: 'var(--font-inter), sans-serif',
            }}
          >
            Légal
          </span>
          <h1
            style={{
              fontSize: 'clamp(26px, 4vw, 38px)',
              fontWeight: 800,
              color: '#111827',
              margin: '0 0 12px',
              letterSpacing: -0.3,
              fontFamily: 'var(--font-space-grotesk), sans-serif',
            }}
          >
            Mentions légales
          </h1>
          <p
            style={{
              fontSize: 14,
              color: '#9CA3AF',
              margin: 0,
              fontFamily: 'var(--font-inter), sans-serif',
            }}
          >
            Dernière mise à jour : avril 2026
          </p>
        </div>

        {/* Sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h2
                style={{
                  fontSize: 17,
                  fontWeight: 700,
                  color: '#111827',
                  margin: '0 0 16px',
                  fontFamily: 'var(--font-space-grotesk), sans-serif',
                  paddingBottom: 12,
                  borderBottom: '1px solid #F0ECF8',
                }}
              >
                {section.title}
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {section.content.map((line, i) => {
                  const isBold = line.startsWith('**') && line.endsWith('**')
                  const text = isBold ? line.slice(2, -2) : line
                  return (
                    <p
                      key={i}
                      style={{
                        margin: 0,
                        fontSize: 14,
                        lineHeight: 1.7,
                        color: isBold ? '#111827' : '#4B5563',
                        fontWeight: isBold ? 600 : 400,
                        fontFamily: 'var(--font-inter), sans-serif',
                      }}
                    >
                      {text}
                    </p>
                  )
                })}
              </div>
            </section>
          ))}
        </div>

        {/* Contact */}
        <div
          style={{
            marginTop: 56,
            background: '#F8F6FF',
            borderRadius: 16,
            padding: '28px 24px',
            border: '1px solid #E2DAF6',
          }}
        >
          <p
            style={{
              margin: '0 0 6px',
              fontSize: 15,
              fontWeight: 600,
              color: '#111827',
              fontFamily: 'var(--font-space-grotesk), sans-serif',
            }}
          >
            Une question d'ordre légal ?
          </p>
          <p
            style={{
              margin: '0 0 16px',
              fontSize: 14,
              color: '#6B7280',
              fontFamily: 'var(--font-inter), sans-serif',
            }}
          >
            Écrivez-nous, nous répondons sous 48h ouvrées.
          </p>
          <a
            href="mailto:contact@nawastudio.com"
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: '#7C63C8',
              textDecoration: 'none',
              fontFamily: 'var(--font-inter), sans-serif',
            }}
          >
            contact@nawastudio.com →
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
          © 2026 Naywa Studio
        </span>
        <Link
          href="/tarifs"
          style={{ fontSize: 12, color: '#9CA3AF', textDecoration: 'none', fontFamily: 'var(--font-inter), sans-serif' }}
        >
          Tarifs
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
