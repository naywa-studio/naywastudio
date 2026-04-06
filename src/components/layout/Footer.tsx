import Link from 'next/link'
import { GradientText } from '@/components/ui'
import { Logo } from '@/components/ui/Logo'

const footerNav = {
  Navigation: [
    { label: 'Accueil', href: '/' },
    { label: 'Agents', href: '#agents' },
    { label: 'Tarifs', href: '#tarifs' },
    { label: 'À propos', href: '#apropos' },
  ],
  Agents: [
    { label: 'Recrutement', href: '#agents' },
    { label: 'Support client', href: '#agents' },
    { label: 'Création contenu', href: '#agents' },
    { label: 'Back-office', href: '#agents' },
  ],
  Contact: [
    { label: 'Réserver un appel', href: '#contact' },
    { label: 'hello@nawastudio.com', href: 'mailto:hello@nawastudio.com' },
  ],
  Légal: [
    { label: 'Mentions légales', href: '/mentions-legales' },
    { label: 'Politique de confidentialité', href: '/confidentialite' },
    { label: 'CGV', href: '/cgv' },
  ],
}

const socialLinks = [
  {
    label: 'LinkedIn',
    href: 'https://linkedin.com/company/nawastudio',
    icon: (
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
        <rect x="2" y="9" width="4" height="12" />
        <circle cx="4" cy="4" r="2" />
      </svg>
    ),
  },
  {
    label: 'X (Twitter)',
    href: 'https://x.com/nawastudio',
    icon: (
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
]

export function Footer() {
  return (
    <footer
      className="border-t border-[#1E1E2E] bg-[#06060A]"
      aria-label="Pied de page"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
        {/* Top: brand + columns */}
        <div className="grid grid-cols-2 gap-8 md:grid-cols-5 lg:gap-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link
              href="/"
              className="inline-flex mb-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066FF] rounded-md"
              aria-label="Nawa Studio — accueil"
            >
              <Logo size="sm" showText={true} />
            </Link>
            <p className="text-sm text-[#8B8BA8] leading-relaxed max-w-[200px]">
              Votre AI Workforce Studio — agents IA sur-mesure pour entreprises ambitieuses.
            </p>

            {/* Social links */}
            <div className="flex items-center gap-3 mt-6">
              {socialLinks.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="p-2 rounded-md text-[#4A4A6A] hover:text-[#F8F8FF] hover:bg-[#1E1E2E] transition-colors"
                >
                  {s.icon}
                </a>
              ))}
            </div>
          </div>

          {/* Nav columns */}
          {(Object.entries(footerNav) as [string, { label: string; href: string }[]][]).map(
            ([section, links]) => (
              <div key={section}>
                <h3 className="text-xs font-semibold uppercase tracking-widest text-[#4A4A6A] mb-4">
                  {section}
                </h3>
                <ul className="flex flex-col gap-2.5" role="list">
                  {links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-sm text-[#8B8BA8] hover:text-[#F8F8FF] transition-colors"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ),
          )}
        </div>

        {/* Bottom bar */}
        <div className="mt-16 pt-8 border-t border-[#1E1E2E] flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-[#4A4A6A]">
            © 2026{' '}
            <GradientText className="text-xs">Nawa Studio</GradientText>
            . Tous droits réservés.
          </p>
          <p className="text-xs text-[#4A4A6A]">
            Conçu et développé avec IA — Paris, France
          </p>
        </div>
      </div>
    </footer>
  )
}
