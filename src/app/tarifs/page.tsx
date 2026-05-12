import type { Metadata } from 'next'
import Link from 'next/link'
import { Logo } from '@/components/ui/Logo'

export const metadata: Metadata = {
  title: 'Tarifs',
  description:
    "Naywa Studio — Nora le CRM IA pour sourceurs. Gratuit pendant la beta privée. Tarification publique à venir.",
}

const INCLUDED = [
  { icon: '⚡', label: 'Mise en service immédiate', desc: 'Compte créé, vivier prêt en quelques secondes.' },
  { icon: '🔑', label: 'IA & parsing inclus',       desc: 'Aucune clé API à configurer de votre côté.' },
  { icon: '🔒', label: 'Données privées',           desc: 'Vos CVs et candidats restent à vous. Pas de revente.' },
  { icon: '💬', label: 'Support direct',            desc: 'Feedback bienvenu, on itère vite.' },
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
            href="/comment-ca-marche"
            style={{
              fontSize: 14, fontWeight: 500,
              color: '#6B7280', textDecoration: 'none',
              padding: '8px 16px',
            }}
          >
            Comment ça marche
          </Link>
          <Link
            href="/workspace"
            style={{
              fontSize: 14, fontWeight: 600,
              color: '#7C63C8', textDecoration: 'none',
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
      <section style={{ padding: '72px 24px 32px', textAlign: 'center', maxWidth: 720, margin: '0 auto' }}>
        <span
          style={{
            display: 'inline-block',
            fontSize: 12, fontWeight: 600,
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
            fontWeight: 800, color: '#111827',
            lineHeight: 1.15,
            margin: '0 0 16px',
            letterSpacing: -0.5,
            fontFamily: 'var(--font-space-grotesk), sans-serif',
          }}
        >
          Gratuit pendant la beta privée
        </h1>
        <p
          style={{
            fontSize: 'clamp(15px, 2vw, 18px)',
            color: '#6B7280', lineHeight: 1.65,
            margin: 0,
            fontFamily: 'var(--font-inter), sans-serif',
          }}
        >
          Nora est en construction. Les premières testeuses ont accès aux nouvelles
          fonctionnalités au fur et à mesure de leur livraison — aucune carte
          bancaire requise. La tarification publique sera annoncée à la sortie
          de beta.
        </p>
      </section>

      {/* Single Nora card */}
      <section style={{ padding: '0 24px 80px', maxWidth: 720, margin: '0 auto' }}>
        <div
          style={{
            position: 'relative',
            background: 'white',
            borderRadius: 22,
            border: '1.5px solid rgba(124,99,200,0.25)',
            padding: '40px 36px',
            boxShadow: '0 16px 48px rgba(124,99,200,0.10)',
          }}
        >
          {/* Badge */}
          <div
            style={{
              position: 'absolute',
              top: -14, right: 24,
              background: '#7C63C8',
              color: 'white',
              fontSize: 11, fontWeight: 700,
              padding: '5px 14px',
              borderRadius: 100,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              fontFamily: 'var(--font-inter), sans-serif',
            }}
          >
            Beta privée — accès libre
          </div>

          <div style={{ marginBottom: 22 }}>
            <span
              style={{
                fontSize: 11, fontWeight: 700,
                letterSpacing: 1.5, textTransform: 'uppercase',
                color: '#7C63C8',
                fontFamily: 'var(--font-inter), sans-serif',
              }}
            >
              Le pack
            </span>
            <h2
              style={{
                fontSize: 28, fontWeight: 800,
                color: '#111827',
                margin: '8px 0 4px',
                letterSpacing: -0.3,
                fontFamily: 'var(--font-space-grotesk), sans-serif',
              }}
            >
              Nora — CRM IA pour sourceurs
            </h2>
            <p
              style={{
                fontSize: 14, color: '#6B7280',
                margin: 0, fontWeight: 500,
                fontFamily: 'var(--font-inter), sans-serif',
              }}
            >
              Vivier de CVs + matching automatique + anonymisation + pipeline
            </p>
          </div>

          {/* Price */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 8,
              padding: '20px 0',
              borderTop: '1px solid rgba(124,99,200,0.18)',
              borderBottom: '1px solid rgba(124,99,200,0.18)',
              flexWrap: 'wrap',
              marginBottom: 22,
            }}
          >
            <span
              style={{
                fontSize: 38, fontWeight: 800,
                color: '#111827',
                lineHeight: 1,
                fontFamily: 'var(--font-space-grotesk), sans-serif',
                letterSpacing: -1,
              }}
            >
              Gratuit
            </span>
            <span
              style={{
                fontSize: 14,
                color: '#9CA3AF',
                paddingBottom: 5,
                fontFamily: 'var(--font-inter), sans-serif',
              }}
            >
              pendant la beta — sans carte bancaire
            </span>
          </div>

          <ul
            style={{
              listStyle: 'none', padding: 0,
              margin: '0 0 28px',
              display: 'flex', flexDirection: 'column', gap: 10,
            }}
          >
            {[
              "Upload de CVs illimité (PDF / DOCX / photo)",
              "Parsing IA structuré (nom, expérience, compétences)",
              "Postes ouverts illimités + matching automatique",
              "Anonymisation 1 clic — PDF prêt à présenter",
              "Pipeline candidat avec relances suggérées",
              "Support direct (feedback bienvenu)",
            ].map((feat) => (
              <li
                key={feat}
                style={{
                  display: 'flex', gap: 12, alignItems: 'flex-start',
                  fontSize: 14, color: '#374151', lineHeight: 1.55,
                  fontFamily: 'var(--font-inter), sans-serif',
                }}
              >
                <span style={{ color: '#7C63C8', fontSize: 16, lineHeight: '20px', flexShrink: 0 }}>✓</span>
                {feat}
              </li>
            ))}
          </ul>

          <Link
            href="/login?mode=signup"
            style={{
              display: 'block', width: '100%', textAlign: 'center',
              padding: '14px 24px', borderRadius: 12,
              fontWeight: 700, fontSize: 15,
              color: 'white',
              background: '#7C63C8',
              textDecoration: 'none',
              fontFamily: 'var(--font-inter), sans-serif',
              boxSizing: 'border-box',
              boxShadow: '0 6px 20px rgba(124,99,200,0.28)',
            }}
          >
            Rejoindre la beta privée →
          </Link>
        </div>

        <p style={{
          textAlign: 'center', marginTop: 18,
          fontSize: 13, color: '#9CA3AF',
          fontFamily: 'var(--font-inter), sans-serif',
        }}>
          Aucune carte bancaire requise pendant la phase beta.
        </p>
      </section>

      {/* Inclus */}
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
              fontSize: 26, fontWeight: 700,
              color: '#111827',
              marginBottom: 48,
              fontFamily: 'var(--font-space-grotesk), sans-serif',
            }}
          >
            Inclus pendant la beta
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 32,
            }}
          >
            {INCLUDED.map((item) => (
              <div
                key={item.label}
                style={{
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', textAlign: 'center', gap: 10,
                }}
              >
                <span style={{ fontSize: 32 }}>{item.icon}</span>
                <p style={{
                  margin: 0, fontSize: 15, fontWeight: 700,
                  color: '#111827',
                  fontFamily: 'var(--font-space-grotesk), sans-serif',
                }}>
                  {item.label}
                </p>
                <p style={{
                  margin: 0, fontSize: 13, color: '#6B7280', lineHeight: 1.55,
                  fontFamily: 'var(--font-inter), sans-serif',
                }}>
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
