"use client"

import Link from 'next/link'
import { Logo } from '@/components/ui/Logo'

type FooterLink = { label: string; href: string; external?: boolean }

const footerLinks: Record<string, FooterLink[]> = {
  Produit: [
    { label: 'Tarifs', href: '/tarifs' },
    { label: 'Mon espace', href: '/workspace' },
    { label: "S'inscrire", href: '/login?mode=signup' },
  ],
  Ressources: [
    { label: 'Comment ça marche', href: '/#how' },
    { label: 'FAQ', href: '/faq' },
    { label: 'Extension Chrome', href: '/install' },
    { label: 'Mentions légales', href: '/mentions-legales' },
  ],
  Contact: [
    { label: 'LinkedIn', href: 'https://linkedin.com/company/nawastudio', external: true },
    { label: 'contact@nawastudio.com', href: 'mailto:contact@nawastudio.com' },
  ],
}

export function Footer() {
  return (
    <footer
      style={{
        background: '#F8F6FF',
        borderTop: '1px solid #E2DAF6',
        position: 'relative',
        zIndex: 2,
      }}
    >
      {/* Main footer content */}
      <div
        style={{
          maxWidth: 1040,
          margin: '0 auto',
          padding: '56px 24px 40px',
          display: 'grid',
          gridTemplateColumns: 'minmax(200px, 1fr) repeat(3, minmax(120px, auto))',
          gap: '40px 48px',
        }}
        className="footer-grid"
      >
        {/* Brand column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Logo size="sm" />
          <p
            style={{
              margin: 0,
              fontFamily: 'var(--font-inter), sans-serif',
              fontSize: 13,
              color: '#6B7280',
              lineHeight: 1.65,
              maxWidth: '28ch',
            }}
          >
            Sourcing automatisé pour recruteurs. Trouvez vos meilleurs candidats LinkedIn en quelques minutes.
          </p>
        </div>

        {/* Link columns */}
        {Object.entries(footerLinks).map(([category, links]) => (
          <div key={category} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p
              style={{
                margin: '0 0 4px',
                fontFamily: 'var(--font-inter), sans-serif',
                fontSize: 11,
                fontWeight: 700,
                color: '#111827',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              {category}
            </p>
            {links.map(({ label, href, external }) => (
              external ? (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontFamily: 'var(--font-inter), sans-serif',
                    fontSize: 13,
                    color: '#6B7280',
                    textDecoration: 'none',
                    transition: 'color 150ms',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#7C63C8')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#6B7280')}
                >
                  {label}
                </a>
              ) : (
                <Link
                  key={label}
                  href={href}
                  style={{
                    fontFamily: 'var(--font-inter), sans-serif',
                    fontSize: 13,
                    color: '#6B7280',
                    textDecoration: 'none',
                    transition: 'color 150ms',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#7C63C8')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#6B7280')}
                >
                  {label}
                </Link>
              )
            ))}
          </div>
        ))}
      </div>

      {/* Bottom bar */}
      <div
        style={{
          maxWidth: 1040,
          margin: '0 auto',
          padding: '20px 24px',
          borderTop: '1px solid #E2DAF6',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-inter), sans-serif',
            fontSize: 12,
            color: '#9CA3AF',
          }}
        >
          © 2026 Naywa Studio. Tous droits réservés.
        </span>
        <span
          style={{
            fontFamily: 'var(--font-inter), sans-serif',
            fontSize: 12,
            color: '#9CA3AF',
          }}
        >
          Fait avec soin à Paris 🇫🇷
        </span>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .footer-grid {
            grid-template-columns: 1fr 1fr !important;
          }
        }
        @media (max-width: 480px) {
          .footer-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </footer>
  )
}
